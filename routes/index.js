const express = require('express');
const router = express.Router();
const conexion = require('../db/conexion');
const multer = require('multer');
const path = require('path');

const almacenamiento = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const nombreFinal = Date.now() + path.extname(file.originalname).toLowerCase();
    cb(null, nombreFinal);
  }
});

const upload = multer({
  storage: almacenamiento,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos .jpg, .jpeg y .png'));
    }
  }
});

/*const almacenamiento = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const nombreFinal = Date.now() + path.extname(file.originalname);
    cb(null, nombreFinal);
  }
});

const upload = multer({ storage: almacenamiento });
*/

router.get('/', (req, res) => {
  res.render('index', { usuario: req.session.usuario });
});

router.get('/registro', (req, res) => {
  res.render('registro');
});

router.post('/registro', (req, res) => {
  const { nombre, apellido, email, contraseña } = req.body;
  const query = 'INSERT INTO usuarios (nombre, apellido, email, contraseña) VALUES (?, ?, ?, ?)';
  conexion.query(query, [nombre, apellido, email, contraseña], (err, resultado) => {
    if (err) return res.send('Error al registrar usuario');
    res.redirect('/login');
  });
});

router.get('/login', (req, res) => {
  res.render('login');
});

router.post('/login', (req, res) => {
  const { email, contraseña } = req.body;
  const query = 'SELECT * FROM usuarios WHERE email = ? AND contraseña = ?';
  conexion.query(query, [email, contraseña], (err, resultados) => {
    if (err) return res.send('Error al iniciar sesión');
    if (resultados.length > 0) {
      req.session.usuario = resultados[0];
      res.redirect('/');
    } else {
      res.send('Email o contraseña incorrectos');
    }
  });
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

router.get('/usuarios', (req, res) => {
  if (!req.session.usuario) return res.redirect('/login');

  const miId = req.session.usuario.id_usuario;

  const query = `
    SELECT *
    FROM usuarios
    WHERE id_usuario != ?
    AND id_usuario NOT IN (
      SELECT 
        CASE
          WHEN id_emisor = ? THEN id_receptor
          WHEN id_receptor = ? THEN id_emisor
        END
      FROM amigos
      WHERE id_emisor = ? OR id_receptor = ?
    )
  `;

  conexion.query(query, [miId, miId, miId, miId, miId], (err, usuarios) => {
    if (err) return res.send('Error al cargar usuarios');
    res.render('usuarios', { usuarios, usuarioActual: req.session.usuario });
  });
});

router.post('/solicitud', (req, res) => {
  if (!req.session.usuario) return res.redirect('/login');

  const id_emisor = req.session.usuario.id_usuario;
  const id_receptor = req.body.id_receptor;

  const validarQuery = `
    SELECT * FROM amigos
    WHERE (id_emisor = ? AND id_receptor = ?) 
       OR (id_emisor = ? AND id_receptor = ?)
  `;

  conexion.query(validarQuery, [id_emisor, id_receptor, id_receptor, id_emisor], (err, rows) => {
    if (err) {
      req.session.error = 'Error al verificar solicitudes.';
      return res.redirect('/usuarios');
    }

    if (rows.length > 0) {
      req.session.error = 'Ya existe una solicitud o amistad con este usuario.';
      return res.redirect('/usuarios');
    }

    const query = 'INSERT INTO amigos (id_emisor, id_receptor, estado) VALUES (?, ?, "pendiente")';
    conexion.query(query, [id_emisor, id_receptor], (err) => {
      if (err) {
        req.session.error = 'Error al enviar solicitud.';
      } else {
        req.session.mensaje = 'Solicitud enviada con éxito.';
      }
      res.redirect('/usuarios');
    });
  });
});


router.get('/solicitudes', (req, res) => {
  if (!req.session.usuario) return res.redirect('/login');

  const miId = req.session.usuario.id_usuario;
  const query = `
    SELECT amigos.id_amigo, usuarios.nombre, usuarios.apellido
    FROM amigos
    JOIN usuarios ON amigos.id_emisor = usuarios.id_usuario
    WHERE amigos.id_receptor = ? AND amigos.estado = 'pendiente'
  `;
  conexion.query(query, [miId], (err, solicitudes) => {
    if (err) return res.send('Error al ver solicitudes');
    res.render('solicitudes', { solicitudes });
  });
});

router.post('/solicitud/:id/responder', (req, res) => {
  const id_amigo = req.params.id;
  const { respuesta } = req.body; // 'aceptado' o 'rechazado'

  const query = 'UPDATE amigos SET estado = ? WHERE id_amigo = ?';
  conexion.query(query, [respuesta, id_amigo], (err) => {
    if (err) return res.send('Error al responder solicitud');
    res.redirect('/solicitudes');
  });
});

router.get('/subir', (req, res) => {
  if (!req.session.usuario) return res.redirect('/login');
  res.render('subir');
});

router.post('/subir', (req, res) => {
  upload.single('imagen')(req, res, (err) => {
    if (err) {
      req.session.error = err.message;
      return res.redirect('/subir');
    }

    if (!req.session.usuario) return res.redirect('/login');

    const { titulo, descripcion } = req.body;

    if (!titulo || !req.file) {
      req.session.error = 'Debés ingresar un título y seleccionar una imagen válida.';
      return res.redirect('/subir');
    }

    const url_imagen = req.file.filename;
    const id_usuario = req.session.usuario.id_usuario;

    const queryAlbum = 'SELECT id_album FROM albumes WHERE id_usuario = ? AND titulo = "Mis obras"';
    conexion.query(queryAlbum, [id_usuario], (err, resultado) => {
      if (err) return res.send('Error al buscar álbum');

      if (resultado.length > 0) {
        insertarImagen(resultado[0].id_album);
      } else {
        const crearAlbum = 'INSERT INTO albumes (id_usuario, titulo) VALUES (?, "Mis obras")';
        conexion.query(crearAlbum, [id_usuario], (err, res2) => {
          if (err) return res.send('Error al crear álbum');
          insertarImagen(res2.insertId);
        });
      }
    });

    function insertarImagen(id_album) {
      const queryImg = 'INSERT INTO imagenes (id_album, titulo, descripcion, url_imagen, compartido) VALUES (?, ?, ?, ?, true)';
      conexion.query(queryImg, [id_album, titulo, descripcion, url_imagen], (err) => {
        if (err) return res.send('Error al guardar imagen');
        req.session.mensaje = 'Imagen subida con éxito.';
        res.redirect('/');
      });
    }
  });
});


// Procesar imagen subida
/*router.post('/subir', upload.single('imagen'), (req, res) => {
  if (!req.session.usuario) return res.redirect('/login');

  const { titulo, descripcion } = req.body;

  if (!titulo || !req.file) {
    req.session.error = 'Debés ingresar un título y seleccionar una imagen.';
    return res.redirect('/subir');
  }

  const url_imagen = req.file.filename;
  const id_usuario = req.session.usuario.id_usuario;

  // Crear álbum por defecto si no existe
  const queryAlbum = 'SELECT id_album FROM albumes WHERE id_usuario = ? AND titulo = "Mis obras"';
  conexion.query(queryAlbum, [id_usuario], (err, resultado) => {
    if (err) return res.send('Error al buscar álbum');

    if (resultado.length > 0) {
      insertarImagen(resultado[0].id_album);
    } else {
      const crearAlbum = 'INSERT INTO albumes (id_usuario, titulo) VALUES (?, "Mis obras")';
      conexion.query(crearAlbum, [id_usuario], (err, res2) => {
        if (err) return res.send('Error al crear álbum');
        insertarImagen(res2.insertId);
      });
    }
  });

  function insertarImagen(id_album) {
    const queryImg = 'INSERT INTO imagenes (id_album, titulo, descripcion, url_imagen, compartido) VALUES (?, ?, ?, ?, true)';
    conexion.query(queryImg, [id_album, titulo, descripcion, url_imagen], (err) => {
      if (err) return res.send('Error al guardar imagen');
      req.session.mensaje = 'Imagen subida con éxito.';
      res.redirect('/');
    });
  }
});
*/

router.get('/mis-imagenes', (req, res) => {
  if (!req.session.usuario) return res.redirect('/login');

  const id_usuario = req.session.usuario.id_usuario;
  const query = `
    SELECT imagenes.titulo, imagenes.descripcion, imagenes.url_imagen
    FROM imagenes
    JOIN albumes ON imagenes.id_album = albumes.id_album
    WHERE albumes.id_usuario = ?
    ORDER BY imagenes.fecha_subida DESC
  `;

  conexion.query(query, [id_usuario], (err, imagenes) => {
    if (err) return res.send('Error al cargar imágenes');
    res.render('mis-imagenes', { imagenes });
  });
});

router.get('/amigos/imagenes-compartidas', (req, res) => {
  if (!req.session.usuario) return res.redirect('/login');

  const miId = req.session.usuario.id_usuario;

  const query = `
    SELECT i.id_imagen, i.titulo, i.descripcion, i.url_imagen, u.nombre, u.apellido
    FROM amigos a
    JOIN albumes al ON a.id_receptor = al.id_usuario
    JOIN imagenes i ON i.id_album = al.id_album
    JOIN usuarios u ON al.id_usuario = u.id_usuario
    WHERE a.id_emisor = ? AND a.estado = 'aceptado' AND i.compartido = true
    ORDER BY i.fecha_subida DESC
  `;

  conexion.query(query, [miId], (err, imagenes) => {
    if (err) return res.send('Error al obtener imágenes');

    const ids = imagenes.map(img => img.id_imagen);
    if (ids.length === 0) return res.render('imagenes-compartidas', { imagenes: [], comentarios: [] });

    const queryComentarios = `
      SELECT c.*, u.nombre, u.apellido
      FROM comentarios c
      JOIN usuarios u ON c.id_autor = u.id_usuario
      WHERE c.id_imagen IN (?)
      ORDER BY c.fecha_comentario ASC
    `;
    conexion.query(queryComentarios, [ids], (err, comentarios) => {
      if (err) return res.send('Error al obtener comentarios');
      res.render('imagenes-compartidas', { imagenes, comentarios });
    });
  });
});

router.post('/comentar', (req, res) => {
  if (!req.session.usuario) return res.redirect('/login');

  const { id_imagen, contenido } = req.body;
  const id_autor = req.session.usuario.id_usuario;

  if (!contenido || contenido.trim() === '') {
    req.session.error = 'El comentario no puede estar vacío.';
    return res.redirect('/amigos/imagenes-compartidas');
  }

  const query = 'INSERT INTO comentarios (id_imagen, id_autor, contenido) VALUES (?, ?, ?)';
  conexion.query(query, [id_imagen, id_autor, contenido], (err) => {
    if (err) {
      req.session.error = 'Error al guardar el comentario.';
      return res.redirect('/amigos/imagenes-compartidas');
    }

    req.session.mensaje = 'Comentario publicado correctamente.';
    res.redirect('/amigos/imagenes-compartidas');
  });
});


router.get('/amigos', (req, res) => {
  if (!req.session.usuario) return res.redirect('/login');

  const miId = req.session.usuario.id_usuario;

  const query = `
    SELECT u.id_usuario, u.nombre, u.apellido, u.email
    FROM amigos a
    JOIN usuarios u ON (
      (a.id_emisor = u.id_usuario AND a.id_receptor = ?) OR
      (a.id_receptor = u.id_usuario AND a.id_emisor = ?)
    )
    WHERE a.estado = 'aceptado'
  `;

  conexion.query(query, [miId, miId], (err, amigos) => {
    if (err) return res.send('Error al obtener amigos');
    res.render('amigos', { amigos });
  });
});

module.exports = router;