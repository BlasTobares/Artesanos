const express = require('express');
const app = express();
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');
const rutas = require('./routes/index');

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(session({
  secret: 'secreto_artesanos',
  resave: false,
  saveUninitialized: false
}));

app.use((req, res, next) => {
  res.locals.usuario = req.session.usuario || null;
  res.locals.mensaje = req.session.mensaje || null;
  res.locals.error = req.session.error || null;
  delete req.session.mensaje;
  delete req.session.error;
  next();
});

app.use('/', rutas);

app.listen(3000, () => {
  console.log('Servidor corriendo en http://localhost:3000');
});