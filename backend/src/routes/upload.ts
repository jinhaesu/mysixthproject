import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
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
    const records = parseExcelFile(filePath);

    if (records.length === 0) {
      res.status(400).json({ error: '유효한 근태 데이터가 없습니다.' });
      return;
    }

    // Analyze with AI
    const analysis = await analyzeAttendance(records);

    // Save upload record
    const insertUpload = db.prepare(
      'INSERT INTO uploads (id, filename, original_filename, record_count, ai_analysis) VALUES (?, ?, ?, ?, ?)'
    );
    insertUpload.run(uploadId, req.file.filename, originalFilename, records.length, JSON.stringify(analysis));

    // Save attendance records
    const insertRecord = db.prepare(`
      INSERT INTO attendance_records (upload_id, date, name, clock_in, clock_out, category, department, workplace, shift, total_hours, regular_hours, overtime_hours, night_hours, break_time, annual_leave)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((recs: typeof records) => {
      for (const r of recs) {
        insertRecord.run(
          uploadId, r.date, r.name, r.clock_in, r.clock_out,
          r.category, r.department, r.workplace, r.shift,
          r.total_hours, r.regular_hours, r.overtime_hours, r.night_hours, r.break_time,
          r.annual_leave
        );
      }
    });

    insertMany(records);

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
router.get('/', (_req: Request, res: Response) => {
  try {
    const uploads = db.prepare(
      'SELECT * FROM uploads ORDER BY uploaded_at DESC'
    ).all();
    res.json(uploads);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete upload and its records
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM attendance_records WHERE upload_id = ?').run(id);
    db.prepare('DELETE FROM uploads WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
