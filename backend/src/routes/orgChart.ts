import { Router, Request, Response } from 'express';
import { dbGet, dbAll, dbRun } from '../db';

const router = Router();

// Get all nodes (flat list, frontend builds tree)
router.get('/', async (_req: Request, res: Response) => {
  try {
    const nodes = await dbAll(
      'SELECT * FROM org_chart_nodes ORDER BY sort_order ASC, id ASC'
    );
    res.json(nodes);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create a node
router.post('/', async (req: Request, res: Response) => {
  try {
    const { parent_id, node_type, name, position, department, employment_type, phone, memo, sort_order } = req.body;
    if (!name) {
      res.status(400).json({ error: '이름은 필수입니다.' });
      return;
    }
    const result = await dbRun(`
      INSERT INTO org_chart_nodes (parent_id, node_type, name, position, department, employment_type, phone, memo, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
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
    const node = await dbGet('SELECT * FROM org_chart_nodes WHERE id = ?', result.lastInsertRowid);
    res.status(201).json(node);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update a node
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { parent_id, node_type, name, position, department, employment_type, phone, memo, sort_order } = req.body;
    await dbRun(`
      UPDATE org_chart_nodes
      SET parent_id = ?, node_type = ?, name = ?, position = ?, department = ?,
          employment_type = ?, phone = ?, memo = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
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
    const node = await dbGet('SELECT * FROM org_chart_nodes WHERE id = ?', id);
    res.json(node);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a node (and children recursively)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // Recursively delete children first
    const deleteChildren = async (parentId: number) => {
      const children = await dbAll('SELECT id FROM org_chart_nodes WHERE parent_id = ?', parentId) as { id: number }[];
      for (const child of children) {
        await deleteChildren(child.id);
        await dbRun('DELETE FROM org_chart_nodes WHERE id = ?', child.id);
      }
    };
    await deleteChildren(Number(id));
    await dbRun('DELETE FROM org_chart_nodes WHERE id = ?', id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
