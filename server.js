var spawn = require('child_process').spawn;
var fs = require("fs");
var mime = require('mime');

eval(fs.readFileSync(__dirname+'/settings.js')+'');

var mode = 'waiting';
	
var http = require('http');	
var io = require('socket.io').listen(settings.socketIoPort);

process.on('uncaughtException', function(err) {
  console.error(err.stack);
});

var viewingHistory = {};

try
{
	viewingHistory = JSON.parse(fs.readFileSync(__dirname+'/viewingHistory.js', 'utf8'));
}
catch (e)
{

}

var player = false;

http.createServer(function (req, res)
{
	var path = req.url.replace(/^\//, '');
	
	if (path == '')
	{console.log('HERE '+__dirname);
		res.writeHead(200, "OK", {'Content-Type': 'text/html'});
        res.write(fs.readFileSync(__dirname+'/index.html', 'utf8').replace('IP_ADDRESS', req.headers.host));
		res.end();
	}
	else
	{
		if (fs.existsSync(__dirname+'/'+path))
		{
			var type = mime.lookup(__dirname+'/'+path);

			res.writeHead(200, {
			   "Content-Type": type
			});
			
			res.write(fs.readFileSync(__dirname+'/'+path, 'binary'), "binary");
			res.end();
		}
		else
		{
			res.writeHead(404, {
			   "Content-Type": "text/plain"
			});
			
			res.write("404 Not Found\n");
			res.end();
		}
	}
	
}).listen(settings.httpPort);


io.sockets.on('connection', function (socket) 
{
	function setMode(m)
	{
		mode = m;
		socket.emit('setMode', { mode: mode});
	}
	
  	socket.on('pauseCommand', function(data) 
  	{
  		setMode('paused');
    	player.stdin.write(" ");
    });
    
    socket.on('stopCommand', function(data) 
  	{
  		setMode('waiting');
    	player.stdin.write("q");
    });
    
    socket.on('playCommand', function(data) 
  	{
  		setMode('playing');
    	player.stdin.write(" ");
    });
    
    socket.on('vUpCommand', function(data) 
  	{
    	player.stdin.write('+');
    });
    
    socket.on('vDownCommand', function(data) 
  	{
    	player.stdin.write('-');
    });
    
    socket.on('fastforwardCommand', function(data) 
  	{
    	player.stdin.write('^[[C');
    });
    
    socket.on('rewindCommand', function(data) 
  	{
    	player.stdin.write('^[[D');
    });
    
    socket.on('play', function(data) 
  	{
  		if (typeof player != "boolean")
  		{
  			player.stdin.write("q");
  			//player.kill("SIGHUP");
  			//process.kill(player);
  		}
	  	
	  	writeViewingHistory(data['path']);
	  	
	  	var args = settings.omxplayerArgs;
	  	args.push(settings.mediaBasePath+'/'+data['path']);
	  	
	  	player = spawn("omxplayer", args);
	  	player.stdin.setEncoding = 'utf-8';
	  	setMode('playing');
    });
    
    socket.on('dirList', function(data) 
  	{
    	console.log();
    	var out = [];
    	
    	var dirs = fs.readdirSync(settings.mediaBasePath+data['dir']).sort(function(a, b) {
	        return a < b ? -1 : 1;
	    });
    	
    	for (var i=0, cnt=dirs.length; i<cnt; i++)
		{
			out.push({path: data['dir']+'/'+dirs[i], name: dirs[i], isFile: fs.statSync(settings.mediaBasePath+data['dir']+'/'+dirs[i]).isFile(), isViewed: viewingHistory[data['dir']+'/'+dirs[i]]})
		}
    	
    	socket.emit('dirList', { list: out});
    });
    
    setMode(mode);
    
});

function writeViewingHistory(path)
{
	viewingHistory[path] = true;
	
	fs.writeFile(__dirname+'/viewingHistory.js', JSON.stringify(viewingHistory), function (err)
	{
	});
}
