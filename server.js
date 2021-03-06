var http = require('http')
, io = require('socket.io')
, express = require('express')
, connectnowww = require('connect-no-www')
, config = require('./config')
, Game = require('./game')
, games = {}
, publicDir = __dirname + '/public'
, fontsDir = publicDir + '/fonts';

function niceifyURL(req, res, next){
    if (/^\/game$/.exec(req.url)) {
	res.writeHead(301, { 'Location': '/game/' });
	return res.end();
    }
    if (/^\/game\//.exec(req.url)) {
	req.url = '/game.html';
    } else if (/^\/about/.exec(req.url)) {
	req.url = '/about.html';
    } else if (/^\/help/.exec(req.url)) {
	req.url = '/help.html';
    } else if (/^\/?$/.exec(req.url)) {
	req.url = '/index.html';
    }
    return next();
}

function getGame(hash) {
    if (hash && hash in games) {
	return games[hash];
    }
    hash = getUnusedHash();
    console.log("New game with tag: " + hash);
    return (games[hash] = new Game(hash));
}

function getUnusedHash() {
    do { 
	var hash = randString(5);
    } while (hash in games);
    return hash;
}

var CHARSET = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A','C','D','E','F','G','H','J','K','L','M','N','P','Q','R','T','V','W','X','Y','Z'];

function randString(num) {
    var string = "";
    while (string.length < num) {
	string += CHARSET[Math.floor(Math.random() * CHARSET.length)];
    }
    return string;
}

require('./initialize')();

var app = express();

app.configure(function() {
    app.use(express.logger(':status :remote-addr :url in :response-time ms'));
    app.use(niceifyURL);
    app.use(connectnowww());
    app.use(express.static(publicDir, {maxAge: config.prod ? 86400000 : 0}));
    app.use(express.static(fontsDir, {maxAge: config.prod ? 86400000 : 0}));
});

var server = http.createServer(app).listen(config.prod ? 8080 : 3000);

io = io.listen(server);

io.configure('production', function() {
  io.enable('browser client minification');  // send minified client
  io.enable('browser client etag');          // apply etag caching logic based on version number
  io.enable('browser client gzip');          // gzip the file
  io.set('log level', 1);                    // reduce logging
  io.set('transports', [                     // enable all transports (optional if you want flashsocket)
      'websocket'
    , 'flashsocket'
    , 'htmlfile'
    , 'xhr-polling'
    , 'jsonp-polling'
  ]);
});

io.sockets.on('connection', function(socket) {
    var game = null;
    socket.on('initialize', function(msg) {
	game = getGame(msg.hash);
	game.registerPlayer(socket, msg.sess);
	(game.handleClientMessage('initialize', socket)).call(game, msg);
	if (msg.hash !== game.hash) {
	    socket.emit('gameHash', game.hash);
	}
    });
    
    socket.on('disconnect', function() {
	if (!game) 
	    return;
	var hash = game.hash;
	game.unregisterPlayer(socket, function() {
	    delete games[hash];
	    console.log('getting rid of ' + hash);
	});
	game = null;
    });
});