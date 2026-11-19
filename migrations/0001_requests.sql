CREATE TABLE IF NOT EXISTS requests (
  session_id TEXT NOT NULL,
  id INTEGER NOT NULL,
  sample_id INTEGER,
  service TEXT NOT NULL CHECK (service IN ('branding', 'web', 'data')),
  project TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('new', 'contacted', 'quoted', 'closed')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (session_id, id)
);

CREATE TABLE IF NOT EXISTS samples (
  id INTEGER PRIMARY KEY,
  service TEXT NOT NULL,
  project TEXT NOT NULL,
  status TEXT NOT NULL,
  days_ago INTEGER NOT NULL
);

INSERT OR IGNORE INTO samples VALUES
  (1,'web','Tienda Nativa','closed',27),
  (2,'branding','Casa Alba','quoted',25),
  (3,'data','Atlas Logística','contacted',23),
  (4,'web','Luma Café','closed',19),
  (5,'branding','Origen Arquitectura','closed',17),
  (6,'web','Estudio Onda','quoted',14),
  (7,'data','Mercado Norte','quoted',12),
  (8,'web','Círculo Editorial','closed',10),
  (9,'branding','Marea Estudio','contacted',8),
  (10,'web','Verde Vivo','new',6),
  (11,'data','Ruta Urbana','new',5),
  (12,'branding','Casa Jacaranda','quoted',4),
  (13,'web','Hotel Horizonte','contacted',3),
  (14,'data','Nodo Distribución','contacted',2),
  (15,'branding','Taller Cedro','new',1),
  (16,'web','Colectivo Prisma','new',0);
