
function ServerSocket(io){
	this.db = require('../config').db;
	this.io = io;
	this.io.on('connection', onConnection);
	function onConnection(socket){
		console.log("Socket Connection State: OK");
		socket.on('chat', function(data){
			io.sockets.emit('chat', data);
		});
	}
}

module.exports = ServerSocket;