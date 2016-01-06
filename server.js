var spawn = require('child_process').spawn;
var fs = require("fs");
var mime = require('mime');

var mdns = require('mdns');
var ad = mdns.createAdvertisement(mdns.tcp('bdizzie-pi'), 80);
ad.start();




eval(fs.readFileSync(__dirname+'/settings.js')+'');

var mode = 'waiting';
var totalSeconds = 0;
var currentFile = '';

var http = require('http');	
var io = require('socket.io').listen(settings.socketIoPort);
//io.set('log level', 1); 
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


io.on('connection', function(socket) 
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
		io.emit('setMode', { mode: mode});
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
    
    socket.on('copyToLocalDrive', function(data) 
  	{
  		var execFile = require('child_process').exec;
  		
  		execFile('/bin/cp "'+settings.mediaBasePath+'/'+data.path+'" "'+settings.mediaBasePath+'/'+settings.localPath+'/"', function(err, stdout, stderr)
		{
			if (stderr)
			{
				socket.emit('copyLocalResult', {success: false, path: data.path});
			}
			else
			{
				socket.emit('copyLocalResult', {success: true, path: data.path});
			}
			
		});
    });
    
    socket.on('markFileAsUnplayed', function(data) 
  	{
  		var parts = data.path.split('/');
  		
  		removePathToHistory(parts[parts.length-1]);
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
	  	
	  	var parts = data['path'].split('/');
	  	
	  	addPathToHistory(parts[parts.length-1]);
	  	
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
    	var out = [];
    	
    	var dirs = fs.readdirSync(settings.mediaBasePath+data['dir']).sort(function(a, b) {
	        return a < b ? -1 : 1;
	    });
    	
    	for (var i=0, cnt=dirs.length; i<cnt; i++)
		{
			if (!/^\./.exec(dirs[i]))
			{
				out.push({
				   path: data['dir']+'/'+dirs[i], 
				   name: dirs[i], 
				   isFile: fs.statSync(settings.mediaBasePath+data['dir']+'/'+dirs[i]).isFile(), 
				   isViewed: viewingHistory[data['dir']+'/'+dirs[i]] || viewingHistory[dirs[i]],
				});
			}
		}
    	
    	socket.emit('dirList', { list: out});
    });
    
    function dirList(path)
    {
	    
    }
    
    socket.on('searchShow', function(data)
    {
    	var execFile = require('child_process').exec;
    	
		execFile('find '+settings.mediaBasePath+settings.tvPath+' -maxdepth 1 -iname "'+data.q+'*" -type d', function(err, stdout, stderr)
		{
			var shows = [];
		  	var file_list = stdout.split('\n');
		  	
		  	for (var line in file_list)
		  	{
		  		var parts = file_list[line].split('/');
		  		
		  		if (parts.length)
		  		{
			  		shows.push(parts[parts.length-1]);
			  	}
		  	}
		  	
		  	socket.emit('showSearchResults', {shows: shows});
		});
    });
    
    socket.on('search', function(data)
    {
    	var results = [];
    	var execFile = require('child_process').exec;
    	
		execFile('find '+settings.mediaBasePath+settings.tvPath+' -maxdepth 1 -iname "'+data.q+'*" -type d', function(err, stdout, stderr)
		{
			var file_list = stdout.split('\n');
			
		  	for (var line in file_list)
		  	{
		  		var parts = file_list[line].split('/');
		  		
		  		if ((parts[0] == '' && parts.length > 1) || parts[0] != '')
		  		{
			  		results.push({
			  		   label: parts[parts.length-1],
			  		   value: parts[parts.length-1],
			  		   type: 'show',
			  		});
			  	}
		  	}
		  	
		  	execFile('find '+settings.mediaBasePath+settings.moviePath+' | grep -i -P "'+replaceAll(' ', '[\\\\. ]', data.q)+'"', function(err, stdout, stderr)// -type f
			{
				var file_list = stdout.split('\n');
			  	
			  	for (var line in file_list)
			  	{
			  		var parts = file_list[line].split('/');
			  		
			  		if ((parts[0] == '' && parts.length > 1) || parts[0] != '')
			  		{
				  		results.push({
				  		   label: parts[parts.length-1],
				  		   value: parts[parts.length-1],
				  		   type: 'movie',
				  		   path: file_list[line].replace(settings.mediaBasePath, ''),
				  		});
				  	}
			  	}
			  	
			  	
		
			  	socket.emit('searchResults', {results: results});
			});
		});
    });
    
    socket.on('searchShowSeason', function(data)
    {
    	var seasons = [];
    	
    	var dirs = fs.readdirSync(settings.mediaBasePath+settings.tvPath+'/'+data.show).sort(function(a, b) {
	        return a < b ? -1 : 1;
	    });
    	
    	for (var i=0, cnt=dirs.length; i<cnt; i++)
		{
			if (!/^\./.exec(dirs[i]))
			{
				seasons.push({
				  		   label: dirs[i],
				  		   value: dirs[i],
				  		   type: 'season',
				  		});
			}
		}
    	
		socket.emit('showSeasonSearchResults', {seasons: seasons});
    });
    
    socket.on('searchShowSeasonSelected', function(data)
    {
    	var out = [];
    	
    	var dirs = fs.readdirSync(settings.mediaBasePath+settings.tvPath+'/'+data.show+'/'+data.season).sort(function(a, b) {
	        return a < b ? -1 : 1;
	    });
	    
	    //var difference = settings.tvPath.replace(settings.mediaBasePath, '');
    	
    	for (var i=0, cnt=dirs.length; i<cnt; i++)
		{		
			if (!/^\./.exec(dirs[i]))
			{	
				out.push({
				   path: settings.tvPath+'/'+data.show+'/'+data.season+'/'+dirs[i], 
				   name: dirs[i], 
				   isFile: fs.statSync(settings.mediaBasePath+settings.tvPath+'/'+data.show+'/'+data.season+'/'+dirs[i]).isFile(), 
				   isViewed: viewingHistory[dirs[i]] || viewingHistory[settings.tvPath+'/'+data.show+'/'+data.season+'/'+dirs[i]],
				});
			}
		}
    	
    	socket.emit('dirList', { list: out});
    });
    
    
    
    
    setMode(mode);
    
});

function replaceAll(find, replace, str) {
  return str.replace(new RegExp(find, 'g'), replace);
}

function addPathToHistory(path)
{
	viewingHistory[path] = true;
	writeViewingHistory(path)
}

function removePathToHistory(path)
{
	viewingHistory[path] = false;
	writeViewingHistory(path)
}

function writeViewingHistory()
{
	fs.writeFile(__dirname+'/viewingHistory.js', JSON.stringify(viewingHistory), function (err)
	{
	});
}
