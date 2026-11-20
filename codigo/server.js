require('dotenv').config();
const express = require('express'), sql = require('mssql');
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.static(__dirname));

const cfg = {
  server: process.env.DB_SERVER || 'localhost', database: process.env.DB_NAME || 'InfotecaCubiculos',
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  options: { encrypt: false, trustServerCertificate: true }
};
if (process.env.DB_INSTANCE) cfg.options.instanceName = process.env.DB_INSTANCE; else cfg.port = +(process.env.DB_PORT || 1433);
const pool = new sql.ConnectionPool(cfg);
const ready = pool.connect().then(() => console.log('Conectado a SQL Server')).catch(e => console.error('Error de conexión:', e.message));

const ms = d => d ? new Date(d).getTime() : null;
const dt = v => v ? new Date(v) : null;
const toApi = r => ({ codigo: r.Codigo, cub: r.CodigoCubiculo, fecha: r.Fecha.toISOString().slice(0, 10), ini: r.HoraInicio, fin: r.HoraFin,
  nombre: r.Nombre, correo: r.Correo, estado: r.Estado, creada: ms(r.CreadaEn), confirmada: ms(r.ConfirmadaEn),
  entrada: ms(r.EntradaEn), salida: ms(r.SalidaEn), canceladaEn: ms(r.CanceladaEn), personas: r.Personas, exclusiva: !!r.Exclusiva });
const SELECT = `SELECT r.Codigo, c.Codigo AS CodigoCubiculo, r.Fecha, r.HoraInicio, r.HoraFin, u.Nombre, u.Correo, r.Estado,
  r.CreadaEn, r.ConfirmadaEn, r.EntradaEn, r.SalidaEn, r.CanceladaEn, r.Personas, r.Exclusiva
  FROM Reservaciones r JOIN Cubiculos c ON c.IdCubiculo = r.IdCubiculo JOIN Usuarios u ON u.IdUsuario = r.IdUsuario`;

app.get('/api/reservas', async (req, res) => {
  try { await ready; const r = await pool.request().query(SELECT + ' ORDER BY r.CreadaEn'); res.json(r.recordset.map(toApi)); }
  catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.put('/api/reservas/:codigo', async (req, res) => {
  const b = req.body, codigo = req.params.codigo;
  try {
    await ready;
    const tx = new sql.Transaction(pool);
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    const rq = () => new sql.Request(tx);
    try {
      const ex = await rq().input('c', sql.NVarChar, codigo).query('SELECT IdReservacion FROM Reservaciones WHERE Codigo = @c');
      if (!ex.recordset.length) {
        const cub = await rq().input('k', sql.NVarChar, b.cub).query('SELECT IdCubiculo, Capacidad FROM Cubiculos WHERE Codigo = @k');
        if (!cub.recordset.length) throw Object.assign(new Error('Cubículo inexistente'), { status: 400 });
        const idCub = cub.recordset[0].IdCubiculo, fecha = new Date(b.fecha + 'T00:00:00Z');
        const cap = cub.recordset[0].Capacidad, personas = Math.max(1, +b.personas || 1), excl = !!b.exclusiva, ef = excl ? cap : personas;
        if (ef > cap) throw Object.assign(new Error('Excede la capacidad'), { status: 400 });
        const act = await rq().input('i', sql.Int, idCub).input('f', sql.Date, fecha).input('a', sql.TinyInt, b.ini).input('z', sql.TinyInt, b.fin)
          .query("SELECT HoraInicio, HoraFin, Personas, Exclusiva FROM Reservaciones WITH (UPDLOCK, HOLDLOCK) WHERE IdCubiculo=@i AND Fecha=@f AND Estado='activa' AND SalidaEn IS NULL AND HoraInicio<@z AND @a<HoraFin");
        for (let h = b.ini; h < b.fin; h++) {
          const usado = act.recordset.filter(x => x.HoraInicio <= h && h < x.HoraFin).reduce((t, x) => t + (x.Exclusiva ? cap : x.Personas), 0);
          if (usado + ef > cap) throw Object.assign(new Error('Sin lugares disponibles'), { status: 409 });
        }
        const u = await rq().input('m', sql.NVarChar, b.correo).query('SELECT IdUsuario FROM Usuarios WHERE Correo = @m');
        const idU = u.recordset.length ? u.recordset[0].IdUsuario
          : (await rq().input('n', sql.NVarChar, b.nombre).input('m', sql.NVarChar, b.correo)
              .query('INSERT INTO Usuarios(Nombre, Correo) OUTPUT INSERTED.IdUsuario VALUES(@n, @m)')).recordset[0].IdUsuario;
        await rq().input('c', sql.NVarChar, codigo).input('i', sql.Int, idCub).input('u', sql.Int, idU).input('f', sql.Date, fecha)
          .input('a', sql.TinyInt, b.ini).input('z', sql.TinyInt, b.fin).input('p', sql.TinyInt, personas).input('x', sql.Bit, excl).input('e', sql.NVarChar, b.estado || 'activa').input('cr', sql.DateTime2, dt(b.creada) || new Date())
          .query('INSERT INTO Reservaciones(Codigo,IdCubiculo,IdUsuario,Fecha,HoraInicio,HoraFin,Personas,Exclusiva,Estado,CreadaEn) VALUES(@c,@i,@u,@f,@a,@z,@p,@x,@e,@cr)');
      } else {
        await rq().input('c', sql.NVarChar, codigo).input('e', sql.NVarChar, b.estado).input('cf', sql.DateTime2, dt(b.confirmada))
          .input('en', sql.DateTime2, dt(b.entrada)).input('sa', sql.DateTime2, dt(b.salida)).input('ca', sql.DateTime2, dt(b.canceladaEn))
          .query('UPDATE Reservaciones SET Estado=@e, ConfirmadaEn=@cf, EntradaEn=@en, SalidaEn=@sa, CanceladaEn=@ca WHERE Codigo=@c');
      }
      await tx.commit();
      res.sendStatus(204);
    } catch (e) { await tx.rollback(); throw e; }
  } catch (e) { console.error(e.message); res.status(e.status || 500).json({ error: e.message }); }
});

app.delete('/api/reservas', async (req, res) => {
  try { await ready; await pool.request().query('DELETE FROM Reservaciones'); res.sendStatus(204); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

const SEL_E = `SELECT e.Codigo, c.Codigo AS CodigoCubiculo, e.Fecha, e.HoraInicio, e.HoraFin, e.Personas, e.Estado, e.CreadaEn, u.Nombre, u.Correo
  FROM ListaEspera e JOIN Cubiculos c ON c.IdCubiculo = e.IdCubiculo JOIN Usuarios u ON u.IdUsuario = e.IdUsuario`;
const toApiE = r => ({ codigo: r.Codigo, cub: r.CodigoCubiculo, fecha: r.Fecha.toISOString().slice(0, 10), ini: r.HoraInicio, fin: r.HoraFin,
  personas: r.Personas, estado: r.Estado, creada: ms(r.CreadaEn), nombre: r.Nombre, correo: r.Correo });

app.get('/api/espera', async (req, res) => {
  try { await ready; const r = await pool.request().query(SEL_E + ' ORDER BY e.CreadaEn'); res.json(r.recordset.map(toApiE)); }
  catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.put('/api/espera/:codigo', async (req, res) => {
  const b = req.body, codigo = req.params.codigo;
  try {
    await ready;
    const ex = await pool.request().input('c', sql.NVarChar, codigo).query('SELECT 1 AS x FROM ListaEspera WHERE Codigo = @c');
    if (ex.recordset.length) {
      await pool.request().input('c', sql.NVarChar, codigo).input('e', sql.NVarChar, b.estado).query('UPDATE ListaEspera SET Estado = @e WHERE Codigo = @c');
    } else {
      const cub = await pool.request().input('k', sql.NVarChar, b.cub).query('SELECT IdCubiculo FROM Cubiculos WHERE Codigo = @k');
      if (!cub.recordset.length) return res.status(400).json({ error: 'Cubículo inexistente' });
      const u = await pool.request().input('m', sql.NVarChar, b.correo).query('SELECT IdUsuario FROM Usuarios WHERE Correo = @m');
      const idU = u.recordset.length ? u.recordset[0].IdUsuario
        : (await pool.request().input('n', sql.NVarChar, b.nombre).input('m', sql.NVarChar, b.correo)
            .query('INSERT INTO Usuarios(Nombre, Correo) OUTPUT INSERTED.IdUsuario VALUES(@n, @m)')).recordset[0].IdUsuario;
      await pool.request().input('c', sql.NVarChar, codigo).input('i', sql.Int, cub.recordset[0].IdCubiculo).input('u', sql.Int, idU)
        .input('f', sql.Date, new Date(b.fecha + 'T00:00:00Z')).input('a', sql.TinyInt, b.ini).input('z', sql.TinyInt, b.fin)
        .input('p', sql.TinyInt, Math.max(1, +b.personas || 1)).input('e', sql.NVarChar, b.estado || 'espera').input('cr', sql.DateTime2, b.creada ? new Date(b.creada) : new Date())
        .query('INSERT INTO ListaEspera(Codigo,IdCubiculo,IdUsuario,Fecha,HoraInicio,HoraFin,Personas,Estado,CreadaEn) VALUES(@c,@i,@u,@f,@a,@z,@p,@e,@cr)');
    }
    res.sendStatus(204);
  } catch (e) { console.error(e.message); res.status(500).json({ error: e.message }); }
});

app.delete('/api/espera', async (req, res) => {
  try { await ready; await pool.request().query('DELETE FROM ListaEspera'); res.sendStatus(204); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(process.env.PORT || 3000, () => console.log('Sistema en http://localhost:' + (process.env.PORT || 3000)));