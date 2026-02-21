import { Router, Request, Response } from 'express';
import db from '../db';

const router = Router();

// Get all nodes (flat list, frontend builds tree)
router.get('/', (_req: Request, res: Response) => {
  try {
    const nodes = db.prepare(
      'SELECT * FROM org_chart_nodes ORDER BY sort_order ASC, id ASC'
    ).all();
    res.json(nodes);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create a node
router.post('/', (req: Request, res: Response) => {
  try {
    const { parent_id, node_type, name, position, department, employment_type, phone, memo, sort_order } = req.body;
    if (!name) {
      res.status(400).json({ error: '이름은 필수입니다.' });
      return;
    }
    const result = db.prepare(`
      INSERT INTO org_chart_nodes (parent_id, node_type, name, position, department, employment_type, phone, memo, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      parent_id || null,
      node_type || 'person',
      name,
      position || '',
      department || '',
      employment_type || '',
      phone || '',
      memo || '',
      sort_order || 0
    );
    const node = db.prepare('SELECT * FROM org_chart_nodes WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(node);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update a node
router.put('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { parent_id, node_type, name, position, department, employment_type, phone, memo, sort_order } = req.body;
    db.prepare(`
      UPDATE org_chart_nodes
      SET parent_id = ?, node_type = ?, name = ?, position = ?, department = ?,
          employment_type = ?, phone = ?, memo = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      parent_id ?? null,
      node_type || 'person',
      name || '',
      position || '',
      department || '',
      employment_type || '',
      phone || '',
      memo || '',
      sort_order || 0,
      id
    );
    const node = db.prepare('SELECT * FROM org_chart_nodes WHERE id = ?').get(id);
    res.json(node);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a node (and children via CASCADE)
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // Recursively delete children first (SQLite FK CASCADE needs PRAGMA)
    const deleteChildren = (parentId: number) => {
      const children = db.prepare('SELECT id FROM org_chart_nodes WHERE parent_id = ?').all(parentId) as { id: number }[];
      for (const child of children) {
        deleteChildren(child.id);
        db.prepare('DELETE FROM org_chart_nodes WHERE id = ?').run(child.id);
      }
    };
    deleteChildren(Number(id));
    db.prepare('DELETE FROM org_chart_nodes WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
