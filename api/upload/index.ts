import type { VercelRequest, VercelResponse } from '@vercel/node';
import Busboy from 'busboy';
import crypto from 'crypto';
import { getAuthUser } from '../../lib/auth';
import { getDb, ensureSchema } from '../../lib/db';
import { parseExcelBuffer } from '../../lib/excelParser';
import { analyzeAttendance } from '../../lib/aiAnalysis';

export const config = {
  api: {
    bodyParser: false,
  },
};

function parseMultipart(req: VercelRequest): Promise<{ buffer: Buffer; filename: string }> {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers as Record<string, string> });
    let fileBuffer: Buffer | null = null;
    let fileName = '';

    busboy.on('file', (_name: string, file: NodeJS.ReadableStream, info: { filename: string }) => {
      const chunks: Buffer[] = [];
      file.on('data', (chunk: Buffer) => chunks.push(chunk));
      file.on('end', () => {
        fileBuffer = Buffer.concat(chunks);
        fileName = info.filename;
      });
    });

    busboy.on('finish', () => {
      if (fileBuffer) resolve({ buffer: fileBuffer, filename: fileName });
      else reject(new Error('파일이 업로드되지 않았습니다.'));
    });

    busboy.on('error', reject);
    req.pipe(busboy);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ error: '인증이 필요합니다.' });

  await ensureSchema();
  const sql = getDb();

  if (req.method === 'GET') {
    try {
      const uploads = await sql`SELECT * FROM uploads ORDER BY uploaded_at DESC`;
      return res.status(200).json(uploads);
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const { buffer, filename } = await parseMultipart(req);

      const ext = filename.split('.').pop()?.toLowerCase();
      if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
        return res.status(400).json({ error: '지원하지 않는 파일 형식입니다. (.xlsx, .xls, .csv만 가능)' });
      }

      const records = parseExcelBuffer(buffer);
      if (records.length === 0) {
        return res.status(400).json({ error: '유효한 근태 데이터가 없습니다.' });
      }

      const analysis = await analyzeAttendance(records);
      const uploadId = crypto.randomUUID();

      await sql`INSERT INTO uploads (id, filename, original_filename, record_count, ai_analysis) VALUES (${uploadId}, ${uploadId + '.' + ext}, ${filename}, ${records.length}, ${JSON.stringify(analysis)})`;

      // Batch insert records (100 at a time to avoid query size limits)
      const batchSize = 100;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        const values = batch.map((r, idx) => {
          const base = idx * 13;
          return `($${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5}, $${base+6}, $${base+7}, $${base+8}, $${base+9}, $${base+10}, $${base+11}, $${base+12}, $${base+13})`;
        }).join(', ');

        const params = batch.flatMap(r => [
          uploadId, r.date, r.name, r.clock_in, r.clock_out,
          r.category, r.department, r.workplace,
          r.total_hours, r.regular_hours, r.overtime_hours, r.break_time,
          r.annual_leave,
        ]);

        await sql(
          `INSERT INTO attendance_records (upload_id, date, name, clock_in, clock_out, category, department, workplace, total_hours, regular_hours, overtime_hours, break_time, annual_leave) VALUES ${values}`,
          params
        );
      }

      return res.status(200).json({
        uploadId,
        filename,
        recordCount: records.length,
        analysis,
      });
    } catch (error: any) {
      console.error('Upload error:', error);
      return res.status(500).json({ error: error.message || '파일 처리 중 오류가 발생했습니다.' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
