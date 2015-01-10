
	//	load

	var express = require('express'),
		socket = require('socket.io');

	//	app

	var app = express();

	app.get('/', function(req, res)
	{
		res.send('Bomberman server');

	});

	//	listen

	var server = app.listen(process.env.PORT || 3000);

	//	socket

	var io = socket(server),
		games = {},
		avatars = ['birdie', 'elephant', 'fishy', 'monkey', 'ram', 'ox', 'piggle', 'whale'];

	io.on('connection', function(socket)
	{
		var socketId = socket.id;

		var gameId,
			userName;

		socket.on('create', function(id, name, avatar, matrix)
		{
			var player = {
				id: socketId,
				name: name,
				avatar: avatar,
				index: 0,
				ready: false,
				alive: true
			};

			games[id] = {
				id: id,
				players: [player],
				matrix: matrix,
				started: false,
				created: Date.now()
			};

			gameId = id;
			userName = name;

			socket.join(id);

			socket.emit('welcome', id, player);

		});

		socket.on('join', function(id, name)
		{
			var game = games[id];

			if (!game) return socket.emit('game-not-found');

			if (game.started) return socket.emit('game-started');

			if (game && game.players.length <= 4)
			{
				var avatar = pickAvatar(game),
					player = {
						id: socketId,
						name: name,
						avatar: avatar,
						index: pickIndex(game),
						ready: false,
						alive: true
					};

				game.players.push(player);

				gameId = id;
				userName = name;

				socket.join(id);

				socket.emit('joined', player, game);

				socket.broadcast.to(id).emit('player-joined', player);
			}

		});

		socket.on('ready', function(id, isReady)
		{
			var game = games[id];

			if (!game) return;

			var totalReady = 0;

			game.players.forEach(function(player, index)
			{
				if (player.id == socketId)
				{
					player.ready = isReady ? true : false;

					io.to(id).emit('ready', player.id, player.ready);
				}

				if (player.ready) totalReady++;

			});

			if (totalReady > 1 && totalReady == game.players.length)
			{
				game.started = true;
				game.matrix = createMatrix();

				io.to(id).emit('start', game.matrix);
			}

		});

		socket.on('move', function(id, player, position)
		{
			var game = games[id];

			if (!game) return;

			game.players.forEach(function(player)
			{
				if (player.id == socketId)
				{
					player.position = position;
				}

			});

			socket.broadcast.to(id).emit('move', player, position);

		});

		socket.on('bomb', function(id, position)
		{
			io.to(id).emit('bomb', position);

			var game = games[id];

			if (!game) return;

			if (!game.started) return;

			var bombTimer = 2000,
				strength = 1;

			setTimeout(function()
			{
				var blown = [
					{
						x: position.x,
						y: position.y
					},
					{
						x: position.x,
						y: position.y - strength
					},
					{
						x: position.x,
						y: position.y + strength
					},
					{
						x: position.x - strength,
						y: position.y
					},
					{
						x: position.x + strength,
						y: position.y
					}
				];

				blown.forEach(function(spot)
				{
					if (canExplode(game.matrix, spot.x, spot.y))
					{
						game.players.forEach(function(player)
						{
							if (player.position.x == spot.x && player.position.y == spot.y)
							{
								player.alive = false;

								io.to(id).emit('death', player.id);
							}

						});
					}

				});

				var totalAlive = 0,
					winner;

				game.players.forEach(function(player)
				{
					if (player.alive)
					{
						totalAlive++;

						winner = player;
					}

				});

				if (totalAlive == 1)
				{
					io.to(id).emit('win', winner);
				}

			}, bombTimer);

		});

		socket.on('disconnect', function()
		{
			if (!gameId) return;

			var game = games[gameId];

			if (!game) return;

			game.players.forEach(function(player, index)
			{
				if (player.id == socketId)
				{
					this.splice(index, 1);

					socket.broadcast.to(gameId).emit('left', player.id);
				}

			}, game.players);

		});

	});

	//	helpers

	function pickAvatar(game)
	{
		var avatar = avatars[Math.floor(Math.random() * avatars.length)];

		game.players.forEach(function(player)
		{
			if (player.avatar == avatar)
			{
				avatar = pickAvatar(game);
			}

		});

		return avatar;
	}

	function pickIndex(game)
	{
		var index = 0;

		game.players.forEach(function(player)
		{
			if (player.index == index)
			{
				index++;
			}

		});

		return index;
	}

	function createMatrix()
	{
		var matrix = {},
			matrixSize = 9;

		var upperLimit = matrixSize - 1,
			upperLimitMinusOne = upperLimit - 1,
			empty = ['0 0', upperLimit + ' 0', '0 ' + upperLimit, upperLimit + ' ' + upperLimit, '1 0', upperLimitMinusOne + ' 0', '0 ' + upperLimitMinusOne, upperLimit + ' ' + upperLimitMinusOne, '0 1', upperLimit + ' 1', '1 ' + upperLimit, upperLimitMinusOne + ' ' + upperLimit];

		for (var x = 0; x < matrixSize; x ++)
		{
			matrix[x] = {};

			for (var y = 0; y < matrixSize; y ++)
			{
				var type;

				if (x % 2 == 1 && y % 2 == 1)
				{
					type = 'pillar';
				}
				else
				{
					type = Math.floor(Math.random() * 10) > 1 ? 'normal' : 'empty';
				}

				if (empty.indexOf(x + ' ' + y) > -1)
				{
					type = 'empty';
				}

				matrix[x][y] = { type: type };
			}
		}

		return matrix;
	}

	function canExplode(matrix, x, y)
	{
		if (!matrix[x]) return;

		var tile = matrix[x][y];

		return tile && (tile.type == 'pillar' ? false : true);
	}

	//	cleanup

	setInterval(function()
	{
		for (id in games)
		{
			var created = games[id].created + (1000 * 60 * 60)

			if (created > Date.now())
			{
				delete games[id];
			}
		}

	}, 1000 * 60 * 10);
