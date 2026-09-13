DROP TABLE IF EXISTS link_items CASCADE;
DROP TABLE IF EXISTS link_collections CASCADE;
DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE key IN ('links.view', 'links.manage'));
DELETE FROM permissions WHERE key IN ('links.view', 'links.manage');
