node-tv-remote
==============

This is a node.js project that allows you to turn a computer into a media server which cam be controlled from your computer or mobile phone's browser.. It has been tested on a Raspberry Pi, but it should also work on any Linux/OS X system.

## Configuration

Edit the settings.js file to set the path to your media directory. It could be a: 
* Local Directory
* USB Drive/Folder
* Fuse/SSH mount
* NFS Mount
* Etc.

apt-get install libavahi-compat-libdnssd-dev

Create a settings.js file and configure as necessary

<code>
  var settings = {
	httpPort: 80,
	socketIoPort: 1337,
	mediaBasePath: '/media',
	tvPath: '/svr2/TV_Shows',
	moviePath: '/diskstation/Movies',
	localPath: '/local',
	omxplayerArgs: ["-s", "-o", "hdmi"], //"-o", "hdmi"
	otherTvServers: ["livingroom-pi.local"], //allows you to continuing playing a media file on any of the listed other servers
};
</code>


It requires the following node modules:

* child_process
* fs
* http
* socket.io
* mdns
* mime-types

It's best to use the forever module/utility to keep the app running in the background.

## Usage

Start the server
<code>
forever start server.js
</code>

Then, in your browser, go to the ip/hostname of the server computer. Browser your media, choose a file, and the multimedia controls will become visible.

