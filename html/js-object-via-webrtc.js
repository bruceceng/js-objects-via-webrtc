//_____________________________________________________________________________________________________________________________________________
//
//   DEAL WITH EXTERNAL I/O COMING THROUGH NODE.JS SERVER
//_____________________________________________________________________________________________________________________________________________

function convertFromHex(hex) {
    var hex = hex.toString();//force conversion
    var str = '';
    for (var i = 0; i < hex.length; i += 2)
        str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    return str;
}

function convertToHex(str) {
    var hex = '';
    for(var i=0;i<str.length;i++) {
        hex += ''+str.charCodeAt(i).toString(16);
    }
    return hex;
}


function makeUniqueName() {
  var uniqueName = "HMI ";
  for (var i=0; i<4; i++) {
    uniqueName += bip39Words[ Math.floor(Math.random()*2048) ];
    if (i<3) {uniqueName += " ";}
  }
  return(uniqueName);
}    


//----------------------------------------------------------------------------------------------------------
//                                                webRTC stuff
//----------------------------------------------------------------------------------------------------------

//keep a list of clients (peers) that are trying to connect

var webRtcClients = {}; //this list is indexed by the clients uniqueID
var thisPeersName = null; //this is the unique id of this peer

var receiveMessageCallback = null; // this is a function that is called when a message is received
function setReceiveMessageCallback(callback) {
	receiveMessageCallback = callback;
}

function setThisPeersName(name) {
	thisPeersName = name;
}

//before peer to peer messaging can start, webrtc peers have to negotiate via a seperate channel. In this case
//that channel will be a web server that allows peers to read/write messages to one another

function checkForRtcMessage()
{	
	if (typeof thisPeersName != "string") {
		console.log("Please set peer name before calling this function");
		return;
	}
	
  //periodically check the node.js server to see if any HMI is trying to connect via webRTC
  //once the handshaking is completed through the web server, webRTC will kick in and provide a direct connection
  var xhttp = new XMLHttpRequest();
	xhttp.onreadystatechange = function() {
		if (xhttp.readyState == 4 && xhttp.status == 200) {
      
      //see if there is a client asking to connect
      if (typeof xhttp.responseText == "string" && xhttp.responseText.length > 0) {
        
        var responseObject = JSON.parse(xhttp.responseText);
        
        if (responseObject.message) {
          console.log("Received message:", atob(responseObject.message));
          var messageObj = JSON.parse(atob(responseObject.message));
          
          if (messageObj.messageType == "requestOffer") {
            webRtcCreateOffer(responseObject.from);
          }
          
          if (messageObj.messageType == "answer") {
            console.log("Answer:", messageObj.answer);
            
            //see if it is from a client that we previously sent an offer to. If not then ignore.
            var clientId = responseObject.from;
            if (typeof webRtcClients[clientId] == "object") {
              var client = webRtcClients[clientId];
              webRtcHaveAnswer(client,messageObj.answer);//window.alert(JSON.stringify(messageObj));
            }
          }

          if (messageObj.messageType == "offer") {
            webRtcCreateAnswer(messageObj.offer,responseObject.from);
          }          
          
        }
      }
      
		}
	};
  var full = location.protocol+'//'+location.hostname+(location.port ? ':'+location.port: ''); 
  
	//xhttp.open("GET", "http://" + window.location.host + "/ioInterface?command=getOtsValues", true);
  xhttp.open("GET", full + "/webrtc?command=readMessage&clientName=" + thisPeersName, true);
	xhttp.send();	  
}

function connectionEnd() {
	if (typeof thisPeersName != "string") {
		console.log("Please set peer name before calling this function");
		return;
	}
  console.log("connection End");
  var xhttp = new XMLHttpRequest();
	xhttp.onreadystatechange = function() {
		if (xhttp.readyState == 4 && xhttp.status == 200) {
      ;
		}
	};
  var full = location.protocol+'//'+location.hostname+(location.port ? ':'+location.port: ''); 
  
	//xhttp.open("GET", "http://" + window.location.host + "/ioInterface?command=getOtsValues", true);
  xhttp.open("GET", full + "/webrtc?command=unload&clientName=" + thisPeersName, true);
	xhttp.send();	 
}

function connectionStart(connectionName) {
	if (typeof thisPeersName != "string") {
		console.log("Please set peer name before calling this function");
		return;
	}
	
  console.log(thisPeersName + " wants to connect to: " + connectionName);
  var xhttp = new XMLHttpRequest();
	xhttp.onreadystatechange = function() {
		if (xhttp.readyState == 4 && xhttp.status == 200) {
    
      ;
		}
	};
  var full = location.protocol+'//'+location.hostname+(location.port ? ':'+location.port: ''); 
  
	//xhttp.open("GET", "http://" + window.location.host + "/ioInterface?command=getOtsValues", true);
  var message = {messageType:"requestOffer"};
  xhttp.open("GET", full + "/webrtc?command=writeMessage&destinationName=" + connectionName + "&clientName=" + thisPeersName + "&message=" + btoa(JSON.stringify(message)), true);
	xhttp.send();	  
}

//log errors
var webRtcFailed = e => console.log(e + " line " + e.lineNumber);
var webRtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

//generate a webRTC offer
function webRtcCreateOffer(clientName)
{
	if (typeof thisPeersName != "string") {
		console.log("Please set peer name before calling this function");
		return;
	}
  //based off code from: http://jsfiddle.net/jib1/b6gLnbob/
  
  //initialize new webRTC objects for this particular client.
  webRtcClients[clientName] = {};
  
  var client = webRtcClients[clientName];
  client.clientId = clientName;
  client.webRtcDc = null;
  client.webRtcSc = null;
  client.webRtcPc = new RTCPeerConnection(webRtcConfig)
  client.webRtcLive = false;
	client.webRtcPc.ondatachannel = function(e) {
		if(client.webRtcDc) {
			client.webRtcSc = e.channel;
			//scInit(client);
		}
		else {
			client.webRtcDc = e.channel;
			webRtcDcInit(client);
		}
  };
  //client.webRtcPc.ondatachannel = e => client.webRtcDc? scInit(client.webRtcSc = e.channel) : webRtcDcInit(client.webRtcDc = e.channel);

  client.webRtcNegotiated = false; // work around FF39- not self-firing negotiationneeded
  client.webRtcPc.onnegotiationneeded = e => {
    client.webRtcNegotiated = true;
    client.webRtcPc.createOffer().then(d => client.webRtcPc.setLocalDescription(d)).then(() => {
      if (client.webRtcLive) client.webRtcSc.send(JSON.stringify({ "sdp": client.webRtcPc.localDescription }));
    }).catch(webRtcFailed);
  };
  
  client.webRtcPc.onicecandidate = e => {
    if (client.webRtcLive) {
      client.webRtcSc.send(JSON.stringify({ "candidate": e.candidate }));
    } else {
      if (e.candidate) return;
      var offerValue = client.webRtcPc.localDescription.sdp;
      
      //send the offer to the web server which will forward it to the client
      webRtcSendOffer(clientName, offerValue);
    }
  };
  client.webRtcDc = client.webRtcPc.createDataChannel("chat");
  client.webRtcSc = client.webRtcPc.createDataChannel("signaling");
  
  webRtcDcInit(client);
  webRtcScInit(client);
  
  if (!client.webRtcNegotiated) {
    client.webRtcPc.onnegotiationneeded();
  }
}

//send a webRTC offer to the client via the webserver
function webRtcSendOffer(clientName, offerValue) {
	if (typeof thisPeersName != "string") {
		console.log("Please set peer name before calling this function");
		return;
	}
	
  var xhttp = new XMLHttpRequest();
	xhttp.onreadystatechange = function() {
		if (xhttp.readyState == 4 && xhttp.status == 200) {
      
      //see if there is a client asking to connect
      if (typeof xhttp.responseText == "string" && xhttp.responseText.length > 0) {
        ;
      }
      
		}
	};
  var full = location.protocol+'//'+location.hostname+(location.port ? ':'+location.port: ''); 
  
	//xhttp.open("GET", "http://" + window.location.host + "/ioInterface?command=getOtsValues", true);
  var message = {messageType: 'offer', offer: offerValue};
  var url = full + "/webrtc?command=writeMessage&clientName=" + thisPeersName + "&destinationName=" + clientName + "&message=" + btoa(JSON.stringify(message));
  
  //console.log(url.length, url);
  xhttp.open("GET", url, true);
	xhttp.send();	    
}

function webRtcScInit(client) {
  client.webRtcSc.onmessage = e => {
    var msg = JSON.parse(e.data);
    if (msg.sdp) {
      var desc = new RTCSessionDescription(JSON.parse(e.data).sdp);
      if (desc.type == "offer") {
        client.webRtcPc.setRemoteDescription(desc).then(() => client.webRtcPc.createAnswer())
        .then(answer => client.webRtcPc.setLocalDescription(answer)).then(() => {
          client.webRtcSc.send(JSON.stringify({ "sdp": webRtcPc.localDescription }));
        }).catch(webRtcFailed);
      } else {
        client.webRtcPc.setRemoteDescription(desc).catch(webRtcFailed);
      }
    } else if (msg.candidate) {
      client.webRtcPc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(webRtcFailed);
    }
  };
}

function sendMessage(clientName, message) {
	if (webRtcClients[clientName] && webRtcClients[clientName].webRtcDc) {
		webRtcClients[clientName].webRtcDc.send(message);
	}
}

function broadcastMessage(message) {
	for (var clientName in webRtcClients) {
		sendMessage(clientName, message);
	}
}

function webRtcDcInit(client) {
  client.webRtcDc.onopen = () => { 
    live = true; 
    console.log("Chat!",client.clientId); 
    window.setTimeout(function () {
			var masterTags = {tag1:{value: 42}, tag2: "bruce"};
      var fullText = JSON.stringify(masterTags);
      var start = performance.now();
      var maxLength = 65000;
      for (var i=0; i<Math.floor(fullText.length / maxLength) + 1; i++) {
        client.webRtcDc.send("message " + i + ": " + fullText.substring(i*maxLength,(i+1)*maxLength));
      }
      var end = performance.now();

      console.log("Took: ", end - start);
    },100);
  };
  client.webRtcDc.onmessage = e => {  
		if (receiveMessageCallback) {
			receiveMessageCallback(e.data);
		}
		else {
			console.log(e.data.substring(0,100), performance.now());
		}
  };
}

//given a webRTC offer, generate an answer

//for some reason thisPeersName is the name of this peer
//clientName is the name of the remote peer
function webRtcCreateAnswer(offer,clientName) {
	if (typeof thisPeersName != "string") {
		console.log("Please set peer name before calling this function");
		return;
	}
	
  console.log("webRtcCreateAnswer", clientName, thisPeersName, webRtcClients);
 
  webRtcClients[clientName] = {};
  
  var client = webRtcClients[clientName];
  client.clientId = clientName;
  client.webRtcDc = null;
  client.webRtcSc = null;
  client.webRtcPc = new RTCPeerConnection(webRtcConfig)
  client.webRtcLive = false;
  client.webRtcPc.ondatachannel = function(e) {
		if(client.webRtcDc) {
			client.webRtcSc = e.channel;
			//scInit(client);
		}
		else {
			client.webRtcDc = e.channel;
			webRtcDcInit(client);
		}
  };

  client.webRtcNegotiated = false; // work around FF39- not self-firing negotiationneeded
  client.webRtcPc.onnegotiationneeded = e => {
    client.webRtcNegotiated = true;
    client.webRtcPc.createOffer().then(d => client.webRtcPc.setLocalDescription(d)).then(() => {
      if (client.webRtcLive) client.webRtcSc.send(JSON.stringify({ "sdp": client.webRtcPc.localDescription }));
    }).catch(webRtcFailed);
  };

 if (client.webRtcPc.signalingState != "stable") return;
  //button.disabled = offer.disabled = true;
  var obj = { type:"offer", sdp:offer };
  client.webRtcPc.setRemoteDescription(new RTCSessionDescription(obj))
  .then(() => client.webRtcPc.createAnswer()).then(d => client.webRtcPc.setLocalDescription(d))
  .catch(webRtcFailed);
  client.webRtcPc.onicecandidate = e => {
    if (e.candidate) return;
    if (!client.webRtcLive) {
      //answer.focus();
      //answer.value = webRtcPc.localDescription.sdp;
      //answer.select();
      console.log("Answer: ", client.webRtcPc.localDescription.sdp);
      var xhttp = new XMLHttpRequest();
      xhttp.onreadystatechange = function() {
        if (xhttp.readyState == 4 && xhttp.status == 200) {
          ;
        }
      };
      var full = location.protocol+'//'+location.hostname+(location.port ? ':'+location.port: ''); 
      
      var messageObj = {messageType: "answer", answer: client.webRtcPc.localDescription.sdp};
      //xhttp.open("GET", "http://" + window.location.host + "/ioInterface?command=getOtsValues", true);
      console.log("send message to: ", clientName);
      xhttp.open("GET", full + "/webrtc?command=writeMessage&clientName=" + thisPeersName + "&destinationName=" + clientName + "&message=" + btoa(JSON.stringify(messageObj)), true);
      xhttp.send();	        
      //send the answer to the engineList
      
      
    } else {
      webRtcSc.send(JSON.stringify({ "candidate": e.candidate }));
    }
  };
}


    
function getRtcConnectionList(callback)
{
	if (typeof thisPeersName != "string") {
		console.log("Please set peer name before calling this function");
		return;
	}
	
  //periodically check the node.js server to see if any HMI is trying to connect via webRTC
  //once the handshaking is completed through the web server, webRTC will kick in and provide a direct connection
  var xhttp = new XMLHttpRequest();
	xhttp.onreadystatechange = function() {
		if (xhttp.readyState == 4 && xhttp.status == 200) {
				// if (typeof xhttp.responseText == "string" && xhttp.responseText.length > 0) {
					// var ioValuesObj = JSON.parse(xhttp.responseText);
      var connectionList = JSON.parse(xhttp.responseText);
      
      callback(connectionList);
		}
	};
  var full = location.protocol+'//'+location.hostname+(location.port ? ':'+location.port: ''); 
  
	//xhttp.open("GET", "http://" + window.location.host + "/ioInterface?command=getOtsValues", true);
  xhttp.open("GET", full + "/webrtc?command=list&clientName=" + thisPeersName, true);
	xhttp.send();	  
}    


function webRtcHaveAnswer(client,answer) {
  if (client.webRtcPc.signalingState != "have-local-offer") return;
  //answer.disabled = true;
  var obj = { type:"answer", sdp:answer};
  client.webRtcPc.setRemoteDescription(new RTCSessionDescription(obj)).catch(webRtcFailed);
}

//---------------------------------------------------------------------------------------------------------------------------------------------

function handleNodeServer(message)
{
	var messageObj = [];
	
	try
	{
		messageObj = JSON.parse(message);
	}
	catch(err)
	{
	}
	//each time we ping the node server (ajax request to http://host/enginePing)
	//it will respond with a list of requests cued up by the remote HMI.
	if (Array.isArray(messageObj))
	{
		for (var i=0; i<messageObj.length; i++)
		{
			var result = handleServerRequest(messageObj[i]);
			
			if (typeof result == "object")
			{
				
				//send an ajax response. 
				var xmlHttp = new XMLHttpRequest();
				
				xmlHttp.onreadystatechange=function()
				{
					// if(xmlHttp.readyState==4)
					// {
					// }
				};
				
				xmlHttp.open("POST","http://" + nodeServer + "/engineResponse",true);
				xmlHttp.setRequestHeader('Content-Type','application/x-www-form-urlencoded');
				
				var cancelAjax = function()
				{
					if (xmlHttp.readyState != 4)
					{
						console.log("ajaxGetTags() didn't respond fast enough.");
						xmlHttp.abort();
						//allow them to call the function again.
						//window.ajaxGetTagsBusy = false;
					}
				};
				
				//set a mechanism to cancel the ajax request if it doesn't return fast enough
				window.setTimeout(cancelAjax,3000);
				//console.log(JSON.stringify(result));
				xmlHttp.send("message="+convertToHex(JSON.stringify(result))); //because encodeURI breaks on long strings.
			}
		}
	}
};

function pingNodeServer()
{
	console.log("Node ping",nodeServer,Date.now());
	if (nodeServer != 0)
	{
		//send an ajax request. 
		var xmlHttp = new XMLHttpRequest();
		
		xmlHttp.onreadystatechange=function()
		{
			if(xmlHttp.readyState==4)
			{
				var response = xmlHttp.responseText;
				//console.log("node server response:",response);
				handleNodeServer(response);
			}
		};
		
		xmlHttp.open("POST","http://" + nodeServer + "/enginePing",true);
		xmlHttp.setRequestHeader('Content-Type','application/x-www-form-urlencoded');
		
		var cancelAjax = function()
		{
			if (xmlHttp.readyState != 4)
			{
				console.log("ajaxGetTags() didn't respond fast enough.");
				xmlHttp.abort();
				//allow them to call the function again.
				//window.ajaxGetTagsBusy = false;
			}
		};
		
		//set a mechanism to cancel the ajax request if it doesn't return fast enough
		window.setTimeout(cancelAjax,3000);
		xmlHttp.send();
			
	}
}

//_____________________________________________________________________________________________________________________________________________
//
//   MAIN LOOP
//_____________________________________________________________________________________________________________________________________________

//this is called once every 200 ms. Run all of the various equipment and scripts.

function mainLoop()
{
	var startTime = performance.now();
}

//_____________________________________________________________________________________________________________________________________________
//
//   START UP
//_____________________________________________________________________________________________________________________________________________

var bson = {};
function start(projectFilename, stateFilename)
{
  bson = new BSON();
}


//_____________________________________________________________________________________________________________________________________________
//
//   JSON PACKING
//_____________________________________________________________________________________________________________________________________________


//<ObjectTemplate> template = CreateTemplateFromObject(jsonObject,[options])
//Generate a template from an object. A template includes functions that will encode and decode an object
//Options: {includeData: true/false, callback: callbackFunction, subkeysPerIteration}
//If include data is true then the template will include the values (not just structure) of the jsonObject used to create it.
//[FUTURE] If a callback function is supplied then the template generation will run asynchronously, templatizing only subkeysPerIteration each iteration. When finished it will call the callbackFunction and pass the template as an argument.

function createTemplateFromObject(jsonObject, options) {
  var buildObjectsText = [];
  var fullPaths = [];
  var values = [];
  var types = [];
  //var obj = inputObj;
  var level = 0;
  
  var keys = Object.keys(jsonObject);
  var keysByLevel = [];
  var indexByLevel = [];
  var objectByLevel = [];
  var parentPathByLevel = [];
  
  keysByLevel[level] = JSON.parse(JSON.stringify(keys));
  indexByLevel[level] = 0;
  objectByLevel[level] = jsonObject;
  parentPathByLevel[level] = "jsObject";
  
  //var parentPath = "";
  var max = 500000;
  var count = 0;
  var done = false;
  while (level>=0 && count < max) {
    count++;
    
    if (indexByLevel[level] == keysByLevel[level].length && level > 0) {
      
      level--;
      
      //console.log("<-", level);
    }
    else {
      
      var index = indexByLevel[level];
      var currentKey = keysByLevel[level][index];
      var value = objectByLevel[level][currentKey];
      
      indexByLevel[level]++;
      
      if ((value === null) || typeof value == "number" || typeof value == "string" || typeof value == "boolean") {
        
        var theType = (value === null)?"null":(typeof value);
        
        types.push(theType);
        values.push(value);
        
        if (Array.isArray(objectByLevel[level])) {
          fullPaths.push(parentPathByLevel[level] + "[" + currentKey + "]");
        }
        else {
          fullPaths.push(parentPathByLevel[level] + "['" + currentKey + "']");
        }
        //console.log("+",value,parentPath + "." + currentKey);
        
      }
      
      if (!(value === null) && typeof value == "object") {
        try {
          keys = Object.keys(value);
        } catch(err) {
          debugger;
        }
        
        if (Array.isArray(objectByLevel[level])) {
          buildObjectsText.push(parentPathByLevel[level] + "[" + currentKey + "] = " + ((Array.isArray(value))?'[]':'{}') + ";");
        }
        else {
          buildObjectsText.push(parentPathByLevel[level] + "['" + currentKey + "'] = " + ((Array.isArray(value))?'[]':'{}') + ";");
        }

        level++;
        objectByLevel[level] = value;
        indexByLevel[level] = 0;
        keysByLevel[level] = JSON.parse(JSON.stringify(keys));
        if (Array.isArray(objectByLevel[level-1])) {
          parentPathByLevel[level] = parentPathByLevel[level-1] + "[" + currentKey + "]";
        }
        else {
          parentPathByLevel[level] = parentPathByLevel[level-1] + "['" + currentKey + "']";
        }
        //console.log("->",currentKey);
      }
    }
    //console.log(level, indexByLevel[level], typeof value);
  }
  
  //lets make some functions that set 500 values at once
  
  var tagsPerFunction = 500;

  var buildFunctions = [];
  //first lets make some functions which create the object structure
  for (var j=0; j<Math.floor(buildObjectsText.length / tagsPerFunction)+1; j++) {
    var buildStructureText = "";
    for (var i=0; i<tagsPerFunction; i++) {
      var index = j * tagsPerFunction + i;
      if (index < buildObjectsText.length) { 
        buildStructureText += buildObjectsText[index] + "\n";
      }
      else {
        break;
      }
    }  
    buildFunctions.push(Function("jsObject", buildStructureText)); 
  }
  
  var decodeFunctions = [];
  var decodeFunctionsText = [];
  var encodeFunctions = [];
  var encodeFunctionsText = [];
  
  //lets divide the values by type: null, string, number, boolean
  // var nullCount = 0;
  // var stringCount = 0;
  // var numberCount = 0;
  // var booleanCount = 0;
  var typeCount = {'number': 0, 'string': 0, 'boolean': 0, 'null': 0};
  var typeValues = {'numbers': [], 'strings': [], 'booleans': [], 'nulls': []};
  
  for (var j=0; j<Math.floor(fullPaths.length / tagsPerFunction)+1; j++) {
    
    var decodeText = "";
    var encodeText = "";
    for (var i=0; i<tagsPerFunction; i++) {
      var index = j * tagsPerFunction + i;
      if (index < fullPaths.length) {
        
        var theType = types[index];
        if (typeof typeCount[theType] == 'number') {
          var typeIndex = typeCount[theType];

          var decodeLine = fullPaths[index] + " = rawObject." + theType + "s[" + typeIndex + "];\n";
          decodeText += decodeLine;
          var encodeLine = "rawObject." + theType + "s[" + typeIndex + "] = " + fullPaths[index] + ";\n";
          encodeText += encodeLine;

          decodeFunctionsText.push(decodeLine);
          encodeFunctionsText.push(encodeLine);

          typeValues[theType+'s'][typeIndex] = values[index];          
          typeCount[theType] = typeCount[theType] + 1;
          
        }
        //functionText += fullPaths[index] + " = values[" + index + "];\n";
        //functionText2 += "values[" + index + "] = " + fullPaths[index] + ";\n";
      }
      else {
        break;
      }
    }
    decodeFunctions.push(Function("jsObject", "rawObject", decodeText));
    encodeFunctions.push(Function("jsObject", "rawObject", encodeText));

    //build function will return just the structure of the object without any of the values.
    var buildFunction = function() {
      var jsObject = {};
      for (var i=0; i<buildFunctions.length; i++) {
        buildFunctions[i](jsObject);
      }
      return(jsObject);
    };    

    //decode function will take a rawObject of the same type as the original and transform it into a normal javascript object
    //there are two forms. The first requires a jsObject that already has a structure. The second creates the structure. Use
    //the second form when this is first called and subsequently use the first form for additional speed.
    var decodeFunction = function(rawObject, jsObject) {
      if (typeof jsObject != 'object') {
        jsObject = buildFunction();
      }
      for (var i=0; i<decodeFunctions.length; i++) {
        decodeFunctions[i](jsObject, rawObject);
      }
      return(jsObject);
    };


    var encodeFunction = function(jsObject) {
      var rawObject = {strings:[], numbers:[], booleans:[], nulls:[]};
      for (var i=0; i<encodeFunctions.length; i++) {
        encodeFunctions[i](jsObject, rawObject);
      }
      return(rawObject);
    };    
  }
  return({paths: fullPaths, values: values, typeValues: typeValues, types: types,  buildObjectsText: buildObjectsText, decodeFunctionsText:decodeFunctionsText, encodeFunctionsText:encodeFunctionsText, buildFunction:buildFunction, decodeFunction:decodeFunction, encodeFunction:encodeFunction});
}


//<RawObject> serializedTemplate = serializeTemplate(<ObjectTemplate> template)
//Serialize template will convert a template object into a special RawObject which is designed to be packed and sent over RTC and then reconstructed by deserializeTemplate
//Essentially this function and the corresponding deserializeTemplate are templates for template creation meant to break the chicken and egg problem of template transmission.
function serializeTemplate(template,options) {
  var buildObjectsText = template.buildObjectsText;
  var decodeFunctionsText = template.decodeFunctionsText;
  var encodeFunctionsText = template.encodeFunctionsText;
  
  //var dataToSend = {"type":"unpack","template":"object1"};
  var rawTemplate = {numbers:[], strings:[], booleans:[], nulls:[]};

  //save the options that were used to serialize so we can correctly deserialize
  if (typeof options != "object") {
    options = {};
  }
  rawTemplate.strings.push(JSON.stringify(options));

  //dataToSend["buildObjectsCount"] = buildObjectsText.length;
  rawTemplate.numbers.push(buildObjectsText.length);
  for (var i=0; i<buildObjectsText.length; i++) {
    //dataToSend["structure_" + i] = buildObjectsText[i];
    rawTemplate.strings.push(buildObjectsText[i]);
  }

  //dataToSend["decodeFunctionCount"] = decodeFunctionsText.length; 
  rawTemplate.numbers.push(decodeFunctionsText.length);
  for (var i=0; i<decodeFunctionsText.length; i++) {
    //dataToSend["decode_" + i] = decodeFunctionsText[i];
    rawTemplate.strings.push(decodeFunctionsText[i]);
  }

  //dataToSend["encodeFunctionCount"] = encodeFunctionsText.length;  
  rawTemplate.numbers.push(encodeFunctionsText.length);
  for (var i=0; i<encodeFunctionsText.length; i++) {
    //dataToSend["encode_" + i] = encodeFunctionsText[i];
    rawTemplate.strings.push(encodeFunctionsText[i]);
  }

  if (options.encodeValues) {
    rawTemplate.numbers = rawTemplate.numbers.concat(template.typeValues.numbers);
    rawTemplate.strings = rawTemplate.strings.concat(template.typeValues.strings);
    rawTemplate.booleans = rawTemplate.booleans.concat(template.typeValues.booleans);
    rawTemplate.nulls = rawTemplate.nulls.concat(template.typeValues.nulls);
  }

  return(rawTemplate);
}

//<ObjectTemplate> template = deserializeTemplate(<RawObject> serializedTemplate)
// Reverse action of serialize templates
function deserializeTemplate(serializedTemplate) {

  var buildObjectsText = [];
  var decodeFunctionsText = [];
  var encodeFunctionsText = [];

  var buildObjectCount = serializedTemplate.numbers[0];
  var decodeCount = serializedTemplate.numbers[1];
  var encodeCount = serializedTemplate.numbers[2];

  var stringIndex=0;

  var encodeOptions = JSON.parse(serializedTemplate.strings[0]);
  stringIndex++;

  for (var i=0; i<buildObjectCount; i++) {
    buildObjectsText[i] = serializedTemplate.strings[stringIndex];
    stringIndex++;
  }
  for (var i=0; i<decodeCount; i++) {
    decodeFunctionsText[i] = serializedTemplate.strings[stringIndex];
    stringIndex++;
  }
  for (var i=0; i<encodeCount; i++) {
    encodeFunctionsText[i] = serializedTemplate.strings[stringIndex];
    stringIndex++;
  }

  //see if they encoded the intial object with the template
  var typeValues = {numbers:[], strings:[], nulls:[], booleans:[]};
  if (encodeOptions.encodeValues) {
    typeValues.strings = serializedTemplate.strings.slice(stringIndex,serializedTemplate.strings.length);
    typeValues.numbers = serializedTemplate.numbers.slice(3,serializedTemplate.numbers.length);
    typeValues.booleans = serializedTemplate.booleans.slice(0,serializedTemplate.booleans.length);
    typeValues.nulls = serializedTemplate.nulls.slice(0,serializedTemplate.nulls.length);
  }

  //create the functions

 //lets make some functions that set 500 values at once
  
  var tagsPerFunction = 500;

  var buildFunctions = [];
  //first lets make some functions which create the object structure
  for (var j=0; j<Math.floor(buildObjectsText.length / tagsPerFunction)+1; j++) {
    var buildStructureText = "";
    for (var i=0; i<tagsPerFunction; i++) {
      var index = j * tagsPerFunction + i;
      if (index < buildObjectsText.length) { 
        buildStructureText += buildObjectsText[index] + "\n";
      }
      else {
        break;
      }
    }  
    buildFunctions.push(Function("jsObject", buildStructureText)); 
  }
  
  var decodeFunctions = [];
  var encodeFunctions = [];

  for (var j=0; j<Math.floor(decodeFunctionsText.length / tagsPerFunction)+1; j++) {
    
    var decodeText = "";

    for (var i=0; i<tagsPerFunction; i++) {
      var index = j * tagsPerFunction + i;
      if (index < decodeFunctionsText.length) {
        decodeText += decodeFunctionsText[index] + "\n";
      }
      else {
        break;
      }
    }
    decodeFunctions.push(Function("jsObject", "rawObject", decodeText));
  }

  for (var j=0; j<Math.floor(encodeFunctionsText.length / tagsPerFunction)+1; j++) {
    
    var encodeText = "";

    for (var i=0; i<tagsPerFunction; i++) {
      var index = j * tagsPerFunction + i;
      if (index < encodeFunctionsText.length) {
        encodeText += encodeFunctionsText[index] + "\n";
      }
      else {
        break;
      }
    }
    encodeFunctions.push(Function("jsObject", "rawObject", encodeText));
  }

  //build function will return just the structure of the object without any of the values.
  var buildFunction = function() {
    var jsObject = {};
    for (var i=0; i<buildFunctions.length; i++) {
      buildFunctions[i](jsObject);
    }
    return(jsObject);
  };    

  //decode function will take a rawObject of the same type as the original and transform it into a normal javascript object
  //there are two forms. The first requires a jsObject that already has a structure. The second creates the structure. Use
  //the second form when this is first called and subsequently use the first form for additional speed.
  var decodeFunction = function(rawObject, jsObject) {
    if (typeof jsObject != 'object') {
      jsObject = buildFunction();
    }
    for (var i=0; i<decodeFunctions.length; i++) {
      decodeFunctions[i](jsObject, rawObject);
    }
    return(jsObject);
  };

  var encodeFunction = function(jsObject) {
    var rawObject = {strings:[], numbers:[], booleans:[], nulls:[]};
    for (var i=0; i<encodeFunctions.length; i++) {
      encodeFunctions[i](jsObject, rawObject);
    }
    return(rawObject);
  };    
  
  return({typeValues: typeValues, buildObjectsText: buildObjectsText, decodeFunctionsText:decodeFunctionsText, encodeFunctionsText:encodeFunctionsText, buildFunction:buildFunction, decodeFunction:decodeFunction, encodeFunction:encodeFunction});
}



//<ArrayBuffer> buffer = packRawObject(<RawObject> rawObject)
//Creates an array buffer from a raw object
function packRawObject(rawObject) {
  var strings = rawObject.strings;
  var numbers = rawObject.numbers;
  var booleans = rawObject.booleans;
  var nulls = rawObject.nulls;
  var maxStringBufferSize = 0;
  var extendedStringCount = 0;
  
  if (!Array.isArray(strings)) {strings = [];}
  if (!Array.isArray(numbers)) {numbers = [];}
  if (!Array.isArray(booleans)) {booleans = [];}
  if (!Array.isArray(nulls)) {nulls = [];}
  
  var nullCount = nulls.length;
  var booleanCount = booleans.length;
  var numberCount = numbers.length;
  var stringCount = strings.length;
  
  for (var i=0; i<stringCount; i++) {
      //strings longer than 255 bytes will be on the extended string list.
      //strings with character codes > 255 will also be on the extended string list.
      if (strings[i].length < 255) {
        maxStringBufferSize+=strings[i].length;
      }
  }
  
  //create some more typed arrays for the different data types
  var numberList = new Float32Array(numberCount);
  //var stringStartList = new Uint32Array(stringCount);
  var stringLengthList = new Uint8Array(stringCount);
  
  var stringBufferRaw = new ArrayBuffer(maxStringBufferSize);
  var stringBuffer = new Uint8Array(stringBufferRaw);
  var booleanList = new Uint8Array(booleanCount);
  
  var extendedStringBufferSize = 0;
  var extendedStringIndexes = []; //an array of the index of each extended string
  
  var stringBufferPosition = 0;
  var booleanIndex=0;
  var numberIndex=0;
  var stringIndex=0;
  
  for (var i=0; i<booleanCount; i++) {
    booleanList[i] = (booleans[i])?1:0;
  }
  
  for (var i=0; i<numberCount; i++) {
    numberList[i] = numbers[i];
  }  
  
  for (var i=0; i<stringCount; i++) {
    var string = strings[i];
    var strlen = 0;
    if (typeof string == 'string') {
      strlen = string.length;
    }
      
    if (strlen < 255) {
      stringLengthList[stringIndex] = strlen;
    }
    
    var isExtendedString = false;
    
    if (strlen < 255) {
      for (var j=0; j<strlen; j++) {
        var charCode = string.charCodeAt(j);
        if (charCode <= 255) {
          stringBuffer[stringBufferPosition+j] = charCode;
        }
        else {
          j = strlen+1; //exit the loop
          isExtendedString = true;
        }
      }
    }
    else {
      isExtendedString = true;
    }
    
    if (!isExtendedString) {
      stringBufferPosition+=strlen;    
    }
    else {
      //its either too long or contains complicated characters so make an extended string
      stringLengthList[stringIndex] = 255; //this will signify an extended length string
      extendedStringCount++;
      extendedStringBufferSize += strlen;
      extendedStringIndexes.push(i);
    }
    
    stringIndex++;

  }
  
  var stringBufferLength = stringBufferPosition;

  //finally encode extended strings
  var extendedStringBuffer = new Uint16Array(extendedStringBufferSize);
  var extendedStringLengthList = new Uint32Array(extendedStringCount);
  var extendedStringBufferPosition = 0;
  for (var j=0; j<extendedStringCount; j++) {
    
    var index = extendedStringIndexes[j];
    var extendedString = strings[index];
    var strlen = extendedString.length;
    
    extendedStringLengthList[j] = strlen;
    for (var k=0; k<strlen; k++) {
      var charCode = extendedString.charCodeAt(k);
      extendedStringBuffer[extendedStringBufferPosition+k] = charCode; 
    }
    extendedStringBufferPosition += strlen;
  }
  var extendedStringBufferLength = extendedStringBufferPosition;
  
  //pack everything together into one buffer
 
  //!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! 
  //it appears we are missing the part where we store the type of each variable. How is that going to work?
  //!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  
  //create a buffer
  //number of numbers (32 bit int), number of bools (32 bit int), number of strings (32 bit int), number of extended strings (32 bit int)
  //add some extra room on the end which will help when sending it. 
  var dataSize = 4*7 + 4*numberCount + 2*Math.ceil(booleanCount/2) + 2*Math.ceil(stringCount/2) + 4*Math.ceil(stringBufferLength/4) + 4*extendedStringCount + 2*extendedStringBufferPosition;
  //add some extra room on the end which will help when sending it. 
  var maxChunkSize = 16*1024;
  var additionalSize = (Math.ceil(dataSize / maxChunkSize) + 4) * 4 * 4;
  bufferSize = 4*Math.ceil(dataSize/4) + additionalSize;
  var buffer = new ArrayBuffer(bufferSize);  
  console.log("dataSize:", dataSize, "bufferSize:", bufferSize);
  
  //first fill out the 6 sizes
  var memOffset = 0; //start with some space for the header
  var sizeArray = new Int32Array(buffer, memOffset, 7*4);
  sizeArray[0] = dataSize;
  sizeArray[1] = numberCount;
  sizeArray[2] = booleanCount;
  sizeArray[3] = stringCount;
  sizeArray[4] = stringBufferLength;
  sizeArray[5] = extendedStringCount;
  sizeArray[6] = extendedStringBufferLength; 
  memOffset += 7*4;
  
  //debugger;
  
  //now fill the numbers
  var floatView = new Float32Array(buffer, memOffset, numberCount);
  floatView.set(numberList); 
  memOffset += numberCount*4;
  
  //now fill the bools (one byte per bool)
  var boolView = new Uint8Array(buffer, memOffset, booleanCount)
  boolView.set(booleanList);
  memOffset += 2*Math.ceil(booleanCount/2); //align to 2 bytes.
  
  //now fill the string length list
  var stringLengthView = new Uint8Array(buffer, memOffset, stringCount);
  stringLengthView.set(stringLengthList);
  memOffset += 2*Math.ceil(stringCount/2);  //align to 2 bytes.
  
  //now fill the string data buffer
  var stringDataView = new Uint8Array(buffer, memOffset, stringBufferLength);
  //make sure we only use the minimum amount of the array since at first we used more than we needed
  var stringDataSource = new Uint8Array(stringBufferRaw,0,stringBufferLength);
  stringDataView.set(stringDataSource);
  memOffset += stringBufferLength; 
  
  //align to 4 bytes.
  memOffset = 4*Math.ceil(memOffset/4);
  //now fill out the length of the extended string buffer
  var extendedStringLengthView = new Uint32Array(buffer, memOffset, extendedStringCount);
  extendedStringLengthView.set(extendedStringLengthList);
  memOffset += 4*extendedStringCount;
  
  //now fill the extended string buffer
  var extendedStringDataSource = new Uint16Array(buffer, memOffset, extendedStringBufferLength);
  extendedStringDataSource.set(extendedStringBuffer);
  
  //show the data
  var rawView = new Uint8Array(buffer);
 
  //console.log(JSON.stringify(values));  
  //console.log("Type list: ", typesList, numberList, stringLengthList, booleanList, stringBuffer);
  //console.log(typesList.length + numberList.length * 4 + stringLengthList.length * 2 + stringBuffer.length + booleanList.length, JSON.stringify(values).length);
  //console.log(rawView);
  
  return(buffer);
}

// function packAllValuesOld(packedData) {
  
  // //can we pack the data into binary arrays?
  
  // //first lets go through and seperate the keys by type
  // var paths = packedData.paths;
  // var values = packedData.values;
  // var types = packedData.types;
  
  // //the first thing to do is pack all the types together so we know in which list to look for each value.
  // var pathsCount = types.length;
  // var nullCount = 0;
  // var booleanCount = 0;
  // var numberCount = 0;
  // var integerCount = 0;
  // var maxStringBufferSize = 0;
  // var stringCount = 0;
  // var extendedStringCount = 0;
  // var typesList = new Uint8Array(pathsCount);
  
  // for (var i=0; i<pathsCount; i++) {
    // if (types[i] == "null") {
      // typesList[i] = 0;
      // nullCount++;
    // }
    // else if (types[i] == "boolean") {
      // typesList[i] = 1;
      // booleanCount++;
    // }
    // else if (types[i] == "number") {
      // typesList[i] = 2;
      // numberCount++;
    // }
    // else if (types[i] == "string") {
      // typesList[i] =3;
      // stringCount++;
      
      // //strings longer than 255 bytes will be on the extended string list.
      // //strings with character codes > 255 will also be on the extended string list.
      // if (values[i].length < 255) {
        // maxStringBufferSize+=values[i].length;
      // }
    // }
    // else {
      // typesList[i] = 4; //undefined
    // }
  // }
  
  // //create some more typed arrays for the different data types
  // var numberList = new Float32Array(numberCount);
  // //var stringStartList = new Uint32Array(stringCount);
  // var stringLengthList = new Uint8Array(stringCount);
  
  // var stringBufferRaw = new ArrayBuffer(maxStringBufferSize);
  // var stringBuffer = new Uint8Array(stringBufferRaw);
  // var booleanList = new Uint8Array(booleanCount);
  
  // var extendedStringBufferSize = 0;
  // var extendedStringIndexes = []; //an array of the index of each extended string
  
  // var stringBufferPosition = 0;
  // var booleanIndex=0;
  // var numberIndex=0;
  // var stringIndex=0;
  // for (var i=0; i<pathsCount; i++) {
    // if (types[i] == "boolean") {
      // booleanList[booleanIndex] = (values[i])?1:0;
      // booleanIndex++;
    // }
    // else if (types[i] == "number") {
      // numberList[numberIndex] = values[i];
      // numberIndex++;
    // }
    // else if (types[i] == "string") {
      // var string = values[i];
      // var strlen = string.length;
      
      // if (strlen < 255) {
        // stringLengthList[stringIndex] = strlen;
      // }
      
      // //stringStartList[stringIndex] = stringBufferPosition;
      
      // var isExtendedString = false;
      
      // if (strlen < 255) {
        // for (var j=0; j<strlen; j++) {
          // var charCode = string.charCodeAt(j);
          // if (charCode <= 255) {
            // stringBuffer[stringBufferPosition+j] = charCode;
          // }
          // else {
            // j = strlen+1; //exit the loop
            // isExtendedString = true;
          // }
        // }
      // }
      // else {
        // isExtendedString = true;
      // }
      
      // if (!isExtendedString) {
        // stringBufferPosition+=strlen;    
      // }
      // else {
        // //its either too long or contains complicated characters so make an extended string
        // stringLengthList[stringIndex] = 255; //this will signify an extended length string
        // extendedStringCount++;
        // extendedStringBufferSize += strlen;
        // extendedStringIndexes.push(i);
      // }
      
      // stringIndex++;

    // }
  // }
  
  // var stringBufferLength = stringBufferPosition;

  // //finally encode extended strings
  // var extendedStringBuffer = new Uint16Array(extendedStringBufferSize);
  // var extendedStringLengthList = new Uint32Array(extendedStringCount);
  // var extendedStringBufferPosition = 0;
  // for (var j=0; j<extendedStringCount; j++) {
    
    // var index = extendedStringIndexes[j];
    // var extendedString = values[index];
    // var strlen = extendedString.length;
    
    // extendedStringLengthList[j] = strlen;
    // for (var k=0; k<strlen; k++) {
      // var charCode = extendedString.charCodeAt(k);
      // extendedStringBuffer[extendedStringBufferPosition+k] = charCode; 
    // }
    // extendedStringBufferPosition += strlen;
  // }
  // var extendedStringBufferLength = extendedStringBufferPosition;
  
  // //pack everything together into one buffer
 
  // //!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! 
  // //it appears we are missing the part where we store the type of each variable. How is that going to work?
  // //!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  
  // //create a buffer
  // //number of numbers (32 bit int), number of bools (32 bit int), number of strings (32 bit int), number of extended strings (32 bit int)
  // //add some extra room on the end which will help when sending it. 
  // var dataSize = 4*7 + 4*numberCount + 2*Math.ceil(booleanCount/2) + 2*Math.ceil(stringCount/2) + 2*Math.ceil(stringBufferLength/2) + 4*extendedStringCount + 2*extendedStringBufferPosition;
  // //add some extra room on the end which will help when sending it. 
  // var maxChunkSize = 16*1024;
  // var additionalSize = (Math.ceil(dataSize / maxChunkSize) + 4) * 4 * 4;
  // bufferSize = 4*Math.ceil(dataSize/4) + additionalSize;
  // var buffer = new ArrayBuffer(bufferSize);  
  // console.log("dataSize:", dataSize, "bufferSize:", bufferSize);
  
  // //first fill out the 6 sizes
  // var memOffset = 0; //start with some space for the header
  // var sizeArray = new Int32Array(buffer, memOffset, 7*4);
  // sizeArray[0] = dataSize;
  // sizeArray[1] = numberCount;
  // sizeArray[2] = booleanCount;
  // sizeArray[3] = stringCount;
  // sizeArray[4] = stringBufferLength;
  // sizeArray[5] = extendedStringCount;
  // sizeArray[6] = extendedStringBufferLength; 
  // memOffset += 7*4;
  
  // //debugger;
  
  // //now fill the numbers
  // var floatView = new Float32Array(buffer, memOffset, numberCount);
  // floatView.set(numberList); 
  // memOffset += numberCount*4;
  
  // //now fill the bools (one byte per bool)
  // var boolView = new Uint8Array(buffer, memOffset, booleanCount)
  // boolView.set(booleanList);
  // memOffset += 2*Math.ceil(booleanCount/2); //align to 2 bytes.
  
  // //now fill the string length list
  // var stringLengthView = new Uint8Array(buffer, memOffset, stringCount);
  // stringLengthView.set(stringLengthList);
  // memOffset += 2*Math.ceil(stringCount/2);  //align to 2 bytes.
  
  // //now fill the string data buffer
  // var stringDataView = new Uint8Array(buffer, memOffset, stringBufferLength);
  // //make sure we only use the minimum amount of the array since at first we used more than we needed
  // var stringDataSource = new Uint8Array(stringBufferRaw,0,stringBufferLength);
  // stringDataView.set(stringDataSource);
  // memOffset += 2*Math.ceil(stringBufferLength/2); //align to 2 bytes.
  
  // //now fill out the length of the extended string buffer
  // var extendedStringLengthView = new Uint32Array(buffer, memOffset, extendedStringCount);
  // extendedStringLengthView.set(extendedStringLengthList);
  // memOffset += 4*extendedStringCount;
  
  // //now fill the extended string buffer
  // var extendedStringDataSource = new Uint16Array(buffer, memOffset, extendedStringBufferLength);
  // extendedStringDataSource.set(extendedStringBuffer);
  
  // //show the data
  // var rawView = new Uint8Array(buffer);
 
  // //console.log(JSON.stringify(values));  
  // //console.log("Type list: ", typesList, numberList, stringLengthList, booleanList, stringBuffer);
  // //console.log(typesList.length + numberList.length * 4 + stringLengthList.length * 2 + stringBuffer.length + booleanList.length, JSON.stringify(values).length);
  // //console.log(rawView);
  
  // return(buffer);
// }


//given an ArrayBuffer, recreate all the arrays of JSON values.
function unpackRawObject(buffer) {
  //get the 6 sizes
  var memOffset = 0;
  var sizeArray = new Int32Array(buffer, memOffset, 7*4);
  var dataSize =                  sizeArray[0];
  var numberCount =               sizeArray[1];
  var booleanCount =              sizeArray[2]; 
  var stringCount =               sizeArray[3]; 
  var stringBufferLength =        sizeArray[4]; 
  var extendedStringCount =       sizeArray[5]; 
  var extendedStringBufferLength =sizeArray[6]; 
  
  memOffset += 7*4;
  
  console.log(numberCount, booleanCount, stringCount, stringBufferLength, extendedStringCount);
  
  //now get the numbers
  var floatView = new Float32Array(buffer, memOffset, numberCount);
  memOffset += numberCount*4;  
  
  var numbers = [];
  for (var i=0; i < numberCount; i++) {
    numbers[i] = floatView[i];
  }
  
  //now get the bools (one byte per bool)
  var boolView = new Uint8Array(buffer, memOffset, booleanCount)
  memOffset += 2*Math.ceil(booleanCount/2); //align to 2 bytes.
  
  var booleans = [];
  for (var i=0; i < booleanCount; i++) {
    booleans[i] = boolView[i];
  }
  
  //now get the string length list
  var stringLengthView = new Uint8Array(buffer, memOffset, stringCount);
  memOffset += 2*Math.ceil(stringCount/2);  //align to 2 bytes.
  
  //now get the string data buffer
  var stringDataView = new Uint8Array(buffer, memOffset, stringBufferLength);
  memOffset += stringBufferLength;

  //align to 4 bytes.
  memOffset = 4*Math.ceil(memOffset/4);
  
  //now get out the length of the extended string buffer
  var extendedStringLengthView = new Uint32Array(buffer, memOffset, extendedStringCount);
  memOffset += 4*extendedStringCount;
  
  //now get the extended string buffer
  var extendedStringDataSource = new Uint16Array(buffer, memOffset, extendedStringBufferLength);
  
  //now get all the strings
  var stringArray = [];
  
  var stringBufferPos=0;
  var extendedStringBufferPos=0;
  var extendedStringCount1=0;
  for (var i=0; i<stringCount; i++) {
    var stringLength = stringLengthView[i];
    
    //see if its actually an extended string
    if (stringLength == 255) {
      //get the length from the next extended string
      var extendedStringLength = extendedStringLengthView[extendedStringCount1];
      extendedStringCount1++;
      
      var string = "";
      for (var j=0; j<extendedStringLength; j++) {
        string += String.fromCharCode(extendedStringDataSource[extendedStringBufferPos]);
        extendedStringBufferPos++;
      }
      stringArray.push(string);
    }
    else
    {
      var string = "";
      for (var j=0; j<stringLength; j++) {
        string += String.fromCharCode(stringDataView[stringBufferPos]);
        stringBufferPos++;
      }   
      stringArray.push(string);      
    }
  }
    
  //TODO: FIX NULLS
  return({strings: stringArray, numbers: numbers, booleans: booleans, nulls:[]});  
  //var result = 
}

//from an unpacked object of the correct form (object template), create a function that will decode another unpacked object into an object of the template type
function createParser(unpackedTemplate) {
  
  if (unpackedTemplate.strings[0] != "unpack") {return;}
  
  var templateType = unpackedTemplate.strings[1];
  
  //var array
  
  var buildObjectLines = unpackedTemplate.numbers[0];
  var unpackObjectLines = unpackedTemplate.numbers[1];
  
  var generateFunctions = []; 
  var unpackFunctions = [];
  
  var linesPerFunction = 500;
  var lineCount = 0;
  var functionText = "";
  for (var i=2; i<buildObjectLines+2; i++) {
    functionText += unpackedTemplate.strings[i];
    lineCount++;
    
    if (lineCount == linesPerFunction || i == buildObjectLines+2-1) {
      generateFunctions.push(Function("root", functionText));
      functionText="";
      lineCount=0;
    }
  }
  
  for (var i=buildObjectLines+2; i<unpackedTemplate.strings.length; i++) {
    functionText += unpackedTemplate.strings[i];
    lineCount++;
    
    if (lineCount == linesPerFunction || i == unpackedTemplate.strings.length-1) {
      unpackFunctions.push(Function("root", "strings", "numbers", "booleans", "nulls", functionText));
      functionText="";
      lineCount=0;
    }
  }

  var generateFunction = function(root) {
    for (var i=0; i<generateFunctions.length; i++) {
      generateFunctions[i](root);
    }
  };  
  
  var unpackFunction = function(root, strings, numbers, booleans, nulls) {
    for (var i=0; i<unpackFunctions.length; i++) {
      unpackFunctions[i](root, strings, numbers, booleans, nulls);
    }
  };
  
  return({generateFunction:generateFunction,unpackFunction:unpackFunction});
  
  //autoStringify.push(Function("root", "values", functionText2));
}

//its not possible to send too large of a buffer so we need to be able to split and then reassemble buffers.
//to get speed, we don't want to copy memory. Instead WebRTC allows us to send ArrayBufferViews so we just need to send multiple views of the
//underlying buffer, but with different offsets

//when we created the buffer we added additional space on the end which will make room for the data we displace with the message headers.

//Message header:
//4 byte integer for message number
//4 byte integer for data length (excludes headers)
//4 byte integer for chunk size
//4 byte integer for chunk number

function splitBuffer(buffer, messageNumber, chunkSize) {
  
  var bufferSize = buffer.byteLength;
  //calculate the size of the data (doesn't include extra space in buffer)
  
  var sizeArray = new Int32Array(buffer, 0, 6*4);
  var dataSize = sizeArray[0]; 

  console.log("dataSize:", dataSize);
  
  var maxChunkSize = 1024*16;
  if (Number.isFinite(chunkSize)) {maxChunkSize = chunkSize;} //allow specification of a different chunk size.  
  
  var additionalSize = (Math.ceil(dataSize / maxChunkSize) + 4 * 4) * 4; 
  
  //var additionalSize = bufferSize - dataSize;
  //var movedDataArray = new Int32Array(buffer, dataSize, additionalSize); //this is where the data overwritten by the header is placed.
  //var dataArray = new Int32Array(buffer, 0, dataSize); //this is the original data
  var bufferArray = new Int8Array(buffer);
  var int32Array = new Int32Array(buffer);
  
  //var movedDataArrayOffset = dataSize; //this is where we start placing copied data so it won't get permanently overwritten by headers
  
  var chunkCount = Math.ceil((dataSize + additionalSize) / maxChunkSize);
  
  for (var i=0; i<chunkCount; i++) {
    var dataSource = new Uint8Array(buffer,i*maxChunkSize,4*4);
    var movedDataArrayOffset = dataSize + i * 4*4;
    bufferArray.set(dataSource, movedDataArrayOffset);
    //movedDataArrayOffset += 4*4;
    
    //after the data is moved then add a header to this chunk
    var header = new Uint32Array(buffer, i*maxChunkSize, 4);
    header[0] = messageNumber;
    header[1] = dataSize;
    header[2] = maxChunkSize;
    header[3] = i;
  }

  return(chunkCount);
}

//use on the buffer after calling splitBuffer to return one piece of it.
function getBufferChunk(buffer, chunkNumber, chunkSize) {
  var bufferSize = buffer.byteLength;
  var maxChunkSize = 1024*16;
  if (Number.isFinite(chunkSize)) {maxChunkSize = chunkSize;} //allow specification of a different chunk size.  
  
  //don't allow chunk length to extend past end of buffer
  var chunkStart = maxChunkSize * chunkNumber;
  var chunkLength = bufferSize - chunkStart;
  if (chunkLength > maxChunkSize) {chunkLength = maxChunkSize;}
  
  var bufferArray = new Int8Array(buffer, chunkStart, chunkLength);
  
  return(bufferArray);
}


//assuming the whole buffer has been sent, lets try to reassemble it.
function reassembleBuffer(buffer) {
  //first thing to do it get the header which contains the buffer size and chunk size
  var header = new Uint32Array(buffer, 0, 4);
  var dataSize = header[1]; //data size in bytes
  var chunkSize = header[2];
  
  //now we need to work backwards from splitBuffer
  var additionalSize = (Math.ceil(dataSize / chunkSize) + 4 * 4) * 4; 

  var chunkCount = Math.ceil((dataSize + additionalSize) / chunkSize);
  for (var i=chunkCount-1; i>=0; i--) {
    var dataDest = new Uint8Array(buffer,i*chunkSize,4*4);
    var movedDataArrayOffset = dataSize + i * 4*4;
    var dataSource = new Uint8Array(buffer,movedDataArrayOffset,4*4);
    dataDest.set(dataSource);     
  }
}

//test to see if split buffer is working properly.
function makeTestBuffer() {
  var dataSize = 4*1024;//400;
  var buffer = new ArrayBuffer(dataSize*4+300*4);  
  var bufferArray = new Int32Array(buffer, 0, dataSize);
  for (var i=0; i<dataSize; i++) {
    bufferArray[i] = i;
  }
  bufferArray[0] = dataSize*4;
  
  return ({"buffer":buffer, "bufferArray":bufferArray});
}

//build a message queue which will store partial messages. When they
//are complete, it will call the supplied callback function.
function createMessageQueue(completeMessageCallback, everyMessageCallback) {
  var receiveBuffer = {}; //this is the global buffer object that will receive and assemble message chunks.
  var receiveMessage = function(message) {

    console.log("Got message!", message);
    
    //see if its an array buffer
    if (message && message instanceof ArrayBuffer && message.byteLength !== undefined) {
      //pull out the header info
      var header = new Uint32Array(message, 0, 4);
      var messageNumber = header[0]; // unique number for the whole message
      var dataSize = header[1]; //data size in bytes
      var chunkSize = header[2];
      var chunkNumber = header[3]; //which chunk did we receive?
      
      //see if we should re-initialize the receive buffer
      if (receiveBuffer.messageNumber != messageNumber) {
        receiveBuffer.messageNumber = messageNumber;

        var additionalSize = (Math.ceil(dataSize / chunkSize) + 4) * 4 * 4;
        var bufferSize = 4*Math.ceil(dataSize/4) + additionalSize;
        var chunkCount = Math.ceil((dataSize + additionalSize) / chunkSize);
        receiveBuffer.buffer = new ArrayBuffer(bufferSize); 
        receiveBuffer.chunkCount = chunkCount;
        receiveBuffer.chunksReceived = 0;
        receiveBuffer.byteView = new Uint8Array(receiveBuffer.buffer);
      }
      
      //now copy the data to the receive buffer
      
      //see what the max length can be
      
      var bufferLength = receiveBuffer.buffer.byteLength;
      var start = chunkNumber*chunkSize;
      var maxLength = bufferLength - start;
      if (maxLength > message.byteLength) {maxLength = message.byteLength;}
      
      var data = new Uint8Array(message,0,maxLength);
      
      //document.getElementById("lastMessage").innerText += "Array! " + performance.now() + " " + message.byteLength + " " + messageNumber + " " + chunkNumber + "\n";  
      
      receiveBuffer.byteView.set(data,chunkNumber*chunkSize);
      receiveBuffer.chunksReceived++; 
    
      if (receiveBuffer.chunksReceived == receiveBuffer.chunkCount) {
        //console.log("Got entire buffer!");
        //reassembleBuffer(globalReceiveBuffer.buffer);
        //var result = unpackAllValues(globalReceiveBuffer.buffer);
        //debugger;
        reassembleBuffer(receiveBuffer.buffer);
        completeMessageCallback(receiveBuffer.buffer);
      }
      
    }
    else {
      if (typeof everyMessageCallback == "function") {
        everyMessageCallback(message);
      }
      //document.getElementById("lastMessage").innerText = message;
    }
  };

  return({receiveBuffer: receiveBuffer, receiveMessage: receiveMessage});
}