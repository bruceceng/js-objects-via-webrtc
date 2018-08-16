var express = require('express'); //use express for easier URL routing
var bodyParser = require('body-parser'); //allow parsing of HTTP POST requests
var fs = require('fs');
var serveIndex = require('serve-index');

//----------------------------------------------------------------------------------------------------------------------------------------------------------
//                   FILE MANIPULATION
//----------------------------------------------------------------------------------------------------------------------------------------------------------

function sanitizePath(input)
{
	var maxLength = 500;
	//var temp = input.replace(/[^a-zA-Z0-9-._~]/g,""); //get rid of unicode
	var temp = input.replace(/[^\x20-\x7F]/g,"");
	temp = temp.substring(0, maxLength); //trim the length
	//remove any ..
	for (var i=0; i<maxLength; i++)
	{
		if (temp.indexOf('..')>=0)
		{
			temp = temp.replace("..",""); //get rid of ".." as many times as necessary
		}
	}
	//get rid of special devices
	var windowsReservedRe = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
	temp = temp.replace(windowsReservedRe, "");
	
	return(temp);
}

//allow a file to be uploaded to the server
var uploadFile = function (req, res) {
	var fileName = sanitizePath(req.query.fileName);
	if (fileName.substr(0,8) == "project/") {fileName = fileName.substr(8);}
  console.log("NAME:",fileName);
  fs.writeFile(__dirname + "/project/" + fileName, req.body, function(err) {
		if(err) {
			console.log(err);
      res.setHeader('Content-type', 'text/plain');
      res.send("Error uploading: " + __dirname + '/project/' + fileName + ": " + err);
      return;
		}	
		
		res.setHeader('Content-type', 'text/plain');
		res.send("Done uploading: "+ __dirname + '/project/' + fileName);
	});
};

//facilitate webRTC connections 
//or any very slow communication
//the idea is that every client (Node.js is considered the server) will generate a unique ID. Then clients can send messages to one another.

var webRtcMessages = {}; //a list of messages being sent from one client to another.
var webRtcConnections = {}; //a list of connected clients.
var webRtcInterface = function (req, res) {
  res.setHeader('Content-type', 'text/plain');
  
  //get the command
  var command = req.query.command;
  var clientName = req.query.clientName; //should be called engineName
  var destinationName = req.query.destinationName;
  var message = req.query.message;
  
  if (command == "readMessage") {
    //console.log("read message: ", clientName);
    //the client should periodically check to see if any messages are addressed to it.
    if (!webRtcConnections[clientName]) {
      webRtcConnections[clientName] = {};
    }
    webRtcConnections[clientName].lastChecked = Date.now();
    //console.log(uniqueName + " " + webRtcConnections[uniqueName].lastChecked);
    
    //see if there is a message.
    if (webRtcMessages[clientName]) {
      res.send(JSON.stringify(webRtcMessages[clientName]));
      console.log("Delivered message: " + JSON.stringify(webRtcMessages[clientName]));
      delete webRtcMessages[clientName];
      return;
    }
    else {
      res.send('{}');
      return;
    }
  }
  
  if (command == "writeMessage") {
    
    //write a message to the destination
    
    var messageObj = {to: destinationName, from: clientName, message: message};
    console.log("Received Message: " + JSON.stringify(messageObj));
    
    webRtcMessages[destinationName] = messageObj;
    res.send('{}');
    return;
  }
  
  if (command == "unload") {
    console.log("Client left: " + clientName);
    delete webRtcConnections[clientName];
    res.send('{}');
    return;
  }
  
  if (command == "list") {
    res.send(JSON.stringify(Object.keys(webRtcConnections),' ',null));
    return;
  }
  
  res.send('WEB RTC');
};

function removeOldWebRtcConnections() {
  var now = Date.now();
  var maxAge = 60000; //milliseconds
  for (var connection in webRtcConnections) {
    if ((now - webRtcConnections[connection].lastChecked) > maxAge) {
      console.log("webRTC connection expired: ", connection);
      delete webRtcConnections[connection];
      
      //also remove any associated messages
      if (webRtcMessages[connection]) {
        delete webRtcMessages[connection];
      }
    }
  }
}

setInterval(removeOldWebRtcConnections, 10000);

var readDirectory = function (req, res) {
	var theDir = req.query.directory;
    theDir = sanitizePath(theDir);
	if (theDir.substr(0,8) == "project/") {theDir = theDir.substr(8);}
	console.log("Reading metadata",theDir);
	readDirectoryHelper(__dirname + '/html/project/' + theDir + '/', function(resultList) {
		res.setHeader('Content-type', 'text/plain');
		res.send(JSON.stringify(resultList),null,' ');	
	});
};

//list files in a directory
var readDirectoryHelper = function(dirname, callback)
{
	fs.readdir(dirname, function (err, resultsList) {
    
        var resultNumber = 0;
        var results = [];
        var processResult = function() {
            fs.stat(dirname + resultsList[resultNumber], function(err, stats) {
                console.log(dirname + resultsList[resultNumber], resultNumber, stats);
                var resultObj = JSON.parse(JSON.stringify(stats));
                resultObj.filename = resultsList[resultNumber];
                resultObj.fullname = dirname + resultsList[resultNumber];
                results.push(resultObj);
                if (resultNumber < resultsList.length - 1) {
                    resultNumber++;
                    processResult();
                } 
                else {
                    callback(results);
                }
            });
        };
		
		if (err || !Array.isArray(resultsList)) {
			console.log("Error", err);
			callback([]);
			return;
		}
        else {       
            processResult();      
            //callback(resultsList);
        }
	});
};

//----------------------------------------------------------------------------------------------------------------------------------------------------------
//                   HTTP SERVER
//----------------------------------------------------------------------------------------------------------------------------------------------------------

//Run a basic HTTP server which will have the functionality of instructing the user how to obtain a certificate to allow communication with the HTTPS server
//Note: there should be a firewall rule in place to forward external port 80 to internal port 8000.
var httpApp = express();
var httpServer = httpApp.listen(8000, '0.0.0.0', function () {

  var host = httpServer.address().address
  var port = httpServer.address().port

  console.log("HTTP server listening at http://%s:%s", host, port)

});

httpApp.use(bodyParser.urlencoded({ extended: false, limit: '50mb' })); // parse application/x-www-form-urlencoded 
httpApp.use(bodyParser.text({limit: '50mb'}));

httpApp.use("/html/",express.static(__dirname + '/html'));
httpApp.use("/project/",serveIndex(__dirname + '/project'));
httpApp.use("/project/",express.static(__dirname + '/project'));

httpApp.all('/', function (req, res) {
  res.writeHead(302, {
    'Location': '/html/index.html'
    //add other headers here...
  });
  res.end();
});

// //here are all the individual projects.
// httpApp.use("/laporte/",express.static(__dirname + '/laporte-8-18-17/html'));
// httpApp.use("/leap/",express.static(__dirname + '/LEAP_C1S7/html'));
// httpApp.use("/sieve/",express.static(__dirname + '/SASOL_SIEVEBED/html'));
// httpApp.use("/sslng/",express.static(__dirname + '/sslng-1-3-2017/html'));

httpApp.all('/webrtc', webRtcInterface);
httpApp.all('/uploadFile', uploadFile);
httpApp.all('/readDirectory', readDirectory);

//set favicon
var favicon = new Buffer('AAABAAMAEBAQAAEABAAoAQAANgAAACAgEAABAAQA6AIAAF4BAAAwMBAAAQAEAGgGAABGBAAAKAAAABAAAAAgAAAAAQAEAAAAAACAAAAAAAAAAAAAAAAQAAAAAAAAALmJNgCmagAA17yNAOLPrAD///8A4MumAMmkZADo2b0A8OXSAKhsAwDOrHEAw5pSAK12FAD58+wA+/jyAAAAAAARERERERERERmZERGZmZkRljWxHFVVU2Eb5HwQ5EREIRx06xDk6IihEb5HkOQ8zJERx06w5FEREREWRHDkURERERx04tRREREREWRN5FERERERyEREUREREREaRERRERERERyERFkREREREWiIIRERERERnMyREREREREREREREQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAIAAAAEAAAAABAAQAAAAAAAACAAAAAAAAAAAAABAAAAAAAAAApmoAAP///wCtdRMAyKJgAPr27wDq28IAuIgzAKVoAADy6dkAwZdMANK0fgDZvpEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB3d3dwAAAAd3d3d3d3cAAAYzMzYAAAcjMzMzMzMzIAB5QREVIAAHkRERERERFGcAAlERETcAB5ERERERERRnAAcxERFSAAeREREREREUZwAAJRERE3AHkRERERERFGcAAHMRERUgB5EREYVVVVVnAAACURERNweREREwIiIiAAAABzEREVIHkRERNwAAAAAAAAclERETd5ERETcAAAAAAAAAcxERFSeRERE3AAAAAAAAAHKBERE3kRERNwAAAAAAAAAHoRERUpERETcAAAAAAAAABygRERORERE3AAAAAAAAAAB6EREVMRERNwAAAAAAAAAAcoERFFERETcAAAAAAAAAAAehERERERE3AAAAAAAAAAAHaBERERERNwAAAAAAAAAAAAoRERERETcAAAAAAAAAAAB2gRERERE3AAAAAAAAAAAAALERERERNwAAAAAAAAAAAAdkERERETcAAAAAAAAAAAAACxERERE3AAAAAAAAAAAAAHZBERERNwAAAAAAAAAAAAAApVVVVZcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAMAAAAGAAAAABAAQAAAAAAIAEAAAAAAAAAAAAABAAAAAAAAAA7uLNAKZqAADXvI0A////AMuoagD28OQAvZFDALN/JADk0bEArnYWAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABEREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREZd3d3d5ERERERGXd3d3d3d3d3d3kREREWVVVVVYkRERERFFVVVVVVVVVVVVgREREZgzMzMzQRERERFDMzMzMzMzMzMzgRERERQzMzMzCRERERFDMzMzMzMzMzMzgRERERkDMzMzNBERERFDMzMzMzMzMzMzgRERERFDMzMzMJERERFDMzMzMzMzMzMzgRERERGQMzMzM0ERERFDMzMzMzMzMzMzgREREREUMzMzMwkRERFDMzMzMzMzMzMzgREREREZAzMzMzQRERFDMzMzOIiIiIiIIRERERERQzMzMzCRERFDMzMzVxERERERERERERERkDMzMzNBERFDMzMzVxERERERERERERERFDMzMzMJERFDMzMzVxERERERERERERERFwMzMzM0ERFDMzMzVxEREREREREREREREUMzMzMwkRFDMzMzVxEREREREREREREREXUzMzMzQRFDMzMzVxERERERERERERERERIzMzMzCRFDMzMzVxERERERERERERERERdTMzMzNBFDMzMzVxEREREREREREREREREjMzMzMJFDMzMzVxERERERERERERERERF1MzMzM0FDMzMzVxERERERERERERERERESMzMzMwlDMzMzVxEREREREREREREREREXUzMzMzRDMzMzVxERERERERERERERERERIzMzMzAjMzMzVxERERERERERERERERERZTMzMzNTMzMzVxEREREREREREREREREREjMzMzMzMzMzVxERERERERERERERERERFlMzMzMzMzMzVxEREREREREREREREREREYMzMzMzMzMzVxEREREREREREREREREREWUzMzMzMzMzVxERERERERERERERERERERgzMzMzMzMzVxERERERERERERERERERERZTMzMzMzMzVxERERERERERERERERERERGDMzMzMzMzVxERERERERERERERERERERFjMzMzMzMzVxEREREREREREREREREREREYMzMzMzMzVxEREREREREREREREREREREWMzMzMzMzVxEREREREREREREREREREREZgzMzMzMzVxERERERERERERERERERERERQzMzMzMzVxERERERERERERERERERERERkoiIiIiIKREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==', 'base64'); 
httpApp.get("/favicon.ico", function(req, res) {
    res.statusCode = 200;
    res.setHeader('Content-Length', favicon.length);
    res.setHeader('Content-Type', 'image/x-icon');
    res.setHeader("Cache-Control", "public, max-age=2592000");                // expiers after a month
    res.setHeader("Expires", new Date(Date.now() + 2592000000).toUTCString());
    res.end(favicon);
});
