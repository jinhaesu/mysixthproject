import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { dbGet, dbAll, dbRun, dbTransaction } from '../db';
import { parseExcelFile } from '../services/excelParser';
import { analyzeAttendance } from '../services/aiAnalysis';

const router = Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const allowedExts = ['.xlsx', '.xls', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('지원하지 않는 파일 형식입니다. (.xlsx, .xls, .csv만 가능)'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Upload Excel file
router.post('/', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: '파일이 업로드되지 않았습니다.' });
      return;
    }

    const uploadId = uuidv4();
    const filePath = req.file.path;
    const originalFilename = req.file.originalname;

    // Parse Excel
    const allRecords = parseExcelFile(filePath);

    if (allRecords.length === 0) {
      res.status(400).json({ error: '유효한 근태 데이터가 없습니다.' });
      return;
    }

    // Filter by type if specified (exclude_category or only_category)
    const excludeCategory = (req.query.exclude_category as string) || (req.body?.exclude_category as string) || '';
    const onlyCategory = (req.query.only_category as string) || (req.body?.only_category as string) || '';
    let records = allRecords;
    if (excludeCategory) {
      records = allRecords.filter(r => !r.category.includes(excludeCategory));
    } else if (onlyCategory) {
      records = allRecords.filter(r => r.category.includes(onlyCategory));
    }

    if (records.length === 0) {
      res.status(400).json({ error: `필터 적용 후 유효한 데이터가 없습니다. (전체: ${allRecords.length}건)` });
      return;
    }

    // Analyze with AI (skip for large files to avoid timeout)
    let analysis;
    if (records.length > 1000) {
      analysis = { duplicates: [], warnings: [], summary: `${records.length}건의 데이터가 업로드되었습니다. (대용량으로 AI 분석 생략)` };
    } else {
      analysis = await analyzeAttendance(records);
    }

    // Save upload record
    await dbRun(
      'INSERT INTO uploads (id, filename, original_filename, record_count, ai_analysis) VALUES (?, ?, ?, ?, ?)',
      uploadId, req.file.filename, originalFilename, records.length, JSON.stringify(analysis)
    );

    // Save attendance records
    await dbTransaction(async (tx) => {
      for (const r of records) {
        await tx.run(
          `INSERT INTO attendance_records (upload_id, date, name, clock_in, clock_out, category, department, workplace, shift, total_hours, regular_hours, overtime_hours, night_hours, break_time, annual_leave)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          uploadId, r.date, r.name, r.clock_in, r.clock_out,
          r.category, r.department, r.workplace, r.shift,
          r.total_hours, r.regular_hours, r.overtime_hours, r.night_hours, r.break_time,
          r.annual_leave
        );
      }
    });

    res.json({
      uploadId,
      filename: originalFilename,
      recordCount: records.length,
      analysis,
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message || '파일 처리 중 오류가 발생했습니다.' });
  }
});

// Get all uploads
router.get('/', async (_req: Request, res: Response) => {
  try {
    const uploads = await dbAll(
      'SELECT * FROM uploads ORDER BY uploaded_at DESC'
    );
    res.json(uploads);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete upload and its records
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await dbRun('DELETE FROM attendance_records WHERE upload_id = ?', id);
    await dbRun('DELETE FROM uploads WHERE id = ?', id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
