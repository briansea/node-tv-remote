var spawn = require('child_process').spawn;
var fs = require("fs");
var mime = require('mime');

eval(fs.readFileSync(__dirname+'/settings.js')+'');

var mode = 'waiting';
var totalSeconds = 0;
var currentFile = '';

var http = require('http');	
var io = require('socket.io').listen(settings.socketIoPort);
io.set('log level', 1); 
var ioClient = require('socket.io-client');

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
	{
		res.writeHead(200, "OK", {'Content-Type': 'text/html'});
		var content = fs.readFileSync(__dirname+'/index.html', 'utf8');
		content = content.replace('IP_ADDRESS', req.headers.host);
		content = content.replace('var otherTvServers = [];', 'var otherTvServers = '+JSON.stringify(settings.otherTvServers)+';');
		
        res.write(content);
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
	function pauseMovie()
	{
		if (mode == 'playing')
		{
			player.stdin.write(" ");
		}
		
		setMode('paused');
	}

	function setMode(m)
	{
		mode = m;
		socket.emit('setMode', { mode: mode});
	}
	
	socket.on('continueOn', function(data) 
  	{
  		if (mode == 'playing')
  		{
  			pauseMovie();
  		}
  		
  		var socketClient = ioClient.connect(data.server, {
	  		port: 1337
	  	});
	  
	  	socketClient.on('connect', function()
	  	{ 
        	socketClient.emit('play', { path: currentFile, startTime: totalSeconds});
		});
    });
	
  	socket.on('pauseCommand', function(data) 
  	{
  		pauseMovie();
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
  			try
			{
				player.stdin.write("q");
			}
			catch (e)
			{
				console.log(e);
			}
  			
  			player.kill();
  			//process.kill(player);
  		}
	  	
	  	writeViewingHistory(data['path']);
	  	
	  	var args = settings.omxplayerArgs.slice(); //clone
	  	
	  	if (typeof data.startTime != "undefined")
	  	{
		  	args.push('-l');
		  	args.push(data.startTime);
	  	}
	  	
	  	currentFile = data['path'];
	  	args.push(settings.mediaBasePath+'/'+currentFile);
	  	
	  	player = spawn("omxplayer", args);
	  	player.stdin.setEncoding = 'utf-8';
	  	totalSeconds = 0;
	  	
	  	player.stdout.on('data', function(data)
	  	{
		  	var lines = data.toString().split(/\r/);
		  	var match = lines[lines.length-1].split(/ +/);
		  	
		  	if (match.length > 7)
		  	{
			  	console.log();
			  	var secs = 0;
			  	var mins = 0;
			  	var hours = 0;
			  	var seconds = Math.round(parseInt(match[7]));
			  	
			  	if (seconds > totalSeconds)
			  	{
				  	totalSeconds = seconds;
			  	}
			  	else
			  	{
				  	return;
			  	}
			  	
			  	if (seconds < 60)
			  	{
				  	secs = seconds;
			  	}
			  	else if (seconds > 60)
			  	{
				  	var secs = seconds % 60;
				  	var minutes = Math.round(seconds/60);
				  	
				  	if (minutes < 60)
				  	{
					  	mins = minutes;
				  	}
				  	else if (minutes > 60)
				  	{
					  	mins = minutes % 60;
					  	hours = Math.round(minutes/60);
				  	}
			  	}
			  	secs = secs.toString();
			  	mins = mins.toString();
			  	hours = hours.toString();
			  	secs = Array(2 + 1 - secs.length).join(0) + secs;
			  	mins = Array(2 + 1 - mins.length).join(0) + mins;
			  	hours = Array(2 + 1 - hours.length).join(0) + hours;
			  	
			  	socket.emit('currentPlayTime', { time:  hours+":"+mins+":"+secs});
		  	}
		  	
		});
		  	
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
