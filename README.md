# js-objects-via-webrtc
Transmit javascript objects over webRTC. Make repeated updates to a common object structure with faster transmission, serialization, and deserialization than JSON. Useful for games, HMIs, etc.




API

Types
ObjectTemplate
An encoding of the structure of a json object. 
The idea is that multiple json objects may share a common structure or, similarly, that the values in a json object might change while the structure remains constant. In both cases, transfer efficiency can be increased by encoding and sending the structure only once.
<RawObject> rawObject = function encode(jsonObject)
This function takes a jsonObject with the same structure as the template object and returns an encoded RawObject
[FUTURE] create an asynchronous version
jsonObject = function decode(<RawObject> rawObject)
This function takes a raw object and returns a normal javascript object
[FUTURE] create an asynchronous version
RawObject
An encoding of only the values of a jsonObject, including none of the key names or structure.
Consists of three ordered arrays of the fundamental json types. {strings:[], numbers:[], booleans:[]}
RawObjectBuffer
A raw object packed into an array buffer
ChunkedBuffer
An array of array buffers where the original buffer has been broken into chunks of a certain maximum length and a header has been added so the original buffer can be quickly reconstructed. 
A chunked buffer is finally of the correct form to send via RTC.
Functions
<ObjectTemplate> template = CreateTemplateFromObject(jsonObject,[options])
Generate a template from an object. A template includes functions that will encode and decode an object
Options: {includeData: true/false, callback: callbackFunction, subkeysPerIteration}
If include data is true then the template will include the values (not just structure) of the jsonObject used to create it.
[FUTURE] If a callback function is supplied then the template generation will run asynchronously, templatizing only subkeysPerIteration each iteration. When finished it will call the callbackFunction and pass the template as an argument.


<RawObject> serializedTemplate = SerializeTemplate(<ObjectTemplate> template)
Serialize template will convert a template object into a special RawObject which is designed to be packed and sent over RTC and then reconstructed by deserializeTemplate
Essentially this function and the corresponding deserializeTemplate are templates for template creation meant to break the chicken and egg problem of template transmission.
<ObjectTemplate> template = deserializeTemplate(<RawObject> serializedTemplate)
Reverse action of serialize templates
<ArrayBuffer> buffer = packRawObject(<RawObject> rawObject)
Creates an array buffer from a raw object
<RawObject> rawObject = unpackRawObject(<ArrayBuffer> buffer)
Creates a raw object from an array buffer (that was created using packRawObject
int chunkCount  = splitBuffer(<ArrayBuffer> buffer, messageNumber, chunkSize)
Transforms the <ArrayBuffer> into a <ChunkedBuffer>. 
Both have the same javascript type of ArrayBuffer, but the ChunkedBuffer has headers overwriting the data at regular intervals, but the data is moved to the end to preserve it. This allows the data to be split into chunks, sent, and reassembled later.
<ChunkedBufferChunk> chunk = getBufferChunk(<ChunkedBuffer>, chunkNumber, chunkSize)  
Given a chunked buffer, return one chunk of it.

receiveMessage
This will handle receiving a ChunkedBufferChunk and will combined chunks into a ChunkedBuffer.

reassembleBuffer(<ChunkedBuffer>)
Reverse the action of split buffer and reproduce the original buffer.


