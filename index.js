"use strict";

// Variables
var docRoot = "/home/aria/Projects/cari-mobil-app/www",
    port = 8081,
    address = "0.0.0.0",
    dbAddress = "0.0.0.0",//'103.10.223.66',
    dbName = 'test',//"carimobil",
    dbPort = "27017",
    //passengers = {},
    orderStatus = ['OPEN', 'ACCEPTED', 'CANCELED', 'EXPIRED', 'COMPLETED', 'PICKED-UP', 'ARRIVED'];
    
var IDGenerator = function(db, collectionName, callback) {
    var latestID = 0
    
    // Sort the results descendingly and only use the first document (the latest ID)
    var cursor = db.collection(collectionName).find().sort( {"id": -1} )
    
    cursor.each(function(err, doc) {
        assert.equal(err, null);
        latestID = (doc !== null) ? doc.id : latestID
        callback(++latestID)
        return false
    });
}

// Console Color Initialization
var colors = require('colors/safe')

// MomentJS Initialization
var moment = require('moment')

// ExpressJS Initialization
var express = require('express'),
    http = require('http'),
    app = express(),
    server = http.createServer(app);
    
// MongoDB Initialization
var MongoClient = require('mongodb').MongoClient,
    assert = require('assert'),
    ObjectId = require('mongodb').ObjectID,
    url = 'mongodb://' + dbAddress + ':' + dbPort + '/' + dbName;

app.use(express.static(docRoot));

// Socket.IO Initialization
var io = require('socket.io').listen(server);

// \/ Event Listeners \/
io.on('connection', function(socket) {
    var clientAddress = socket.handshake.address
    
    console.log('%s connected from %s at %s', colors.bold.green(socket.id), colors.bold.green(socket.handshake.address), colors.bold.green(moment().format('DD-MM-YYYY HH:mm:ss Z')))
    
    MongoClient.connect(url, function(err, db) {
        assert.equal(null, err);
        console.log("Connected to database");
        
        // Updating socketID in corresponding client's database
            
        
        //console.log(socket.handshake.session)
        //console.log("ID %s ", socket.id)
    
        function insertToDB(clientData) {
            IDGenerator(db, clientData.type + 's', function(userID) {
                /* clientData example :
                 *{ id : 1,
                    socketID: 'R8OXmxIN5b13y0ahAAAB',
                    lat: -6.2087634,
                    lng: 106.84559899999999,
                    name: 'Tri',
                    phoneNumber: '2',
                    ipAddress: '',
                    type: 'driver' } }*/
                clientData.id = userID
                clientData.ipAddress = clientAddress
                
                // Saving user data to database
                db.collection(clientData.type+ 's').insertOne(clientData, function(err, result) {
                    assert.equal(err, null)
                    
                    if (clientData.type !== 'order') {
                        socket.emit('userHasBeenRegistered', clientData)
                    }
                    console.log('Saved to ' + clientData.type + 's')
                })
            })
        }
        
        socket.on("reconnectToServer", function(userData, sendBackToClient) {
            // Updating the client's registered socket ID in database after reconnecting
            db.collection(userData.type + 's').updateOne(
                { "id" : parseInt(userData.id) },
                { $set: { "socketID": socket.id, "status" : "CONNECTED" } },
                function(err, results) {
                    if (results) {
                        console.log('Socket ID updated after relogging in')
                    }
                    else {
                        console.log('Line 98 updateOne error : ', colors.bold.red(err))
                    }
                }
            )
            
            console.log('%s reconnected from %s at %s', colors.bold.green(socket.id), colors.bold.green(socket.handshake.address), colors.bold.green(moment().format('DD-MM-YYYY HH:mm:ss Z')))
        })
        
        socket.on("disconnect", function() {
            console.log('%s disconnected from %s at %s', colors.bold.yellow(socket.id), colors.bold.yellow(socket.handshake.address), colors.bold.yellow(moment().format('DD-MM-YYYY HH:mm:ss Z')))
            
            var collections = ['passengers', 'drivers']

            //for (var a = 0; a < 2; a++) {
            for (var collectionName of collections) {
                db.collection(collectionName).updateOne(
                    { "socketID": socket.id },
                    { $set: { "status" : "NOT CONNECTED" } },
                    function(err, results) {
                        if (results) {
                            //console.log('Socket ID is disconnected')
                        }
                        else {
                            console.log('Line 94 updateOne error : ', colors.bold.red(err))
                        }
                    }
                )
            }
            
            //db.close()
            //console.log('A user from %s is disconnected', clientAddress);
            //console.log("Database connection has been closed")
        })
        
        var userGroup = ['driver', 'passenger'];
        for (var element of userGroup) {//var a = 0; a < 2; a++) {
            //driverSignUp and passengerSignUp
            //socket.on(userGroup[a] + "SignUp", function(userData, sendBackToClient) {
            socket.on(element + "SignUp", function(userData, sendBackToClient) {
                //console.log(userData.type + 'Data', userData)
                insertToDB(userData)
                sendBackToClient()
            })
        }
        
        //for (var a = 0; a < 2; a++) {
        for (var element of userGroup) {
            //driverLogIn and passengerLogIn
            //socket.on(userGroup[a] + "LogIn", function(userData, sendBackToClient) {
            socket.on(element + "LogIn", function(userData, sendBackToClient) {
                
                var foundUser = []
                var cursor = db.collection(userData.type + 's').find({
                    phoneNumber : userData.phoneNumber,
                    password : userData.password
                })

                cursor.each(function(err, user) {
                    assert.equal(err, null)
                    if (user !== null) {
                        foundUser.push(user)
                    }
                    else {
                        // Login successful
                        if (foundUser.length === 1) {
                            // Updating the client's registered socket ID and connection status in database
                            db.collection(userData.type + 's').updateOne(
                                { "id" : foundUser[0].id },
                                { $set: { "socketID": socket.id, "status" : "CONNECTED" } },
                                function(err, results) {
                                    if (results) {
                                        // foundUser[0].socketID and foundUser[0].status are still those of the pre-updated value
                                        // So they must be updated manually before sent back to client
                                        foundUser[0].socketID = socket.id
                                        foundUser[0].status = 'CONNECTED'
                                        
                                        sendBackToClient(foundUser[0])
                                        console.log(colors.bold.green('Socket ID and connection status in database updated after logging in'))
                                    }
                                    else {
                                        console.log('Line 173 updateOne error : ', colors.bold.red(err))
                                    }
                                }
                            )
                        }
                        // Login failed
                        else {
                            sendBackToClient('Failed. Found ' + foundUser.length + ' user(s)')
                        }
                    }
                })
                
                // Updating the client's registered socket ID in database after logging in
                /*db.collection(userData.type + 's').updateOne(
                    { "id" : parseInt(userData.id) },
                    { $set: { "socketID": socket.id, "status" : "CONNECTED" } },
                    function(err, results) {
                        if (results) {
                            console.log('Socket ID in database updated after logging in')
                        }
                        else {
                            console.log('Line 135 updateOne error : ', err)
                        }
                    }
                )*/
            })
        }

        socket.on("driversDataFetch", function(dataFromClient, sendBackToClient) {
            var drivers = []
            
            // Locating all available drivers after the passenger logs in
            var cursor = db.collection('drivers').find( { "status" : "CONNECTED" } )
            
            // cursor.each() iterates each of its element and add one null document
            // So it will always end with null
            // This is useful to, say, accumulate every cursor's element in one array while it's not a null
            // and send it back to the client when it is null
            cursor.each( function(err, driver) {
                assert.equal(err, null)
                if (driver !== null) {
                    drivers.push(driver)
                }
                else {
                    sendBackToClient(drivers)
                }
            })
        })
        
        socket.on("orderAccepted", function(acceptedOrder, sendBackToClient) {
            db.collection('orders').updateOne(
                { "id" : acceptedOrder.id },
                { $set : { 'driverID' : acceptedOrder.driverID } },
                function(err, results) {}
            )
                                
            var cursor = db.collection('orders').find( { "id" : acceptedOrder.id } )
            
            cursor.each(function(err, order) {
                assert.equal(err, null);
                if (order !== null) {
                    if (order.status !== 'OPEN') {
                        // THE ORDER IS NOT OPEN ANYMORE
                        sendBackToClient("ACCEPTED")
                    }
                    else {
                        db.collection('orders').updateOne(
                            { "id" : acceptedOrder.id },
                            { $set : { 'status' : 'ACCEPTED' } },
                            function(err, results) {
                                // Looking up the accepting's driver in database
                                var driverCursor = db.collection('drivers').find( { "id": acceptedOrder.driverID } )                        
                                driverCursor.each(function(err, driver) {
                                    assert.equal(err, null);
                                    if (driver !== null) {
                                        // Driver's GPS location isn't saved in database
                                        // so it must be updated manually before sent to the passenger
                                        driver['lat'] = acceptedOrder.driverLat
                                        driver['lng'] = acceptedOrder.driverLng
                                        
                                        // INFORMING THE PASSENGER THAT A DRIVER ACCEPTS HIS/HER ORDER AND SEND THE ACCEPTING DRIVER'S DATA
                                        socket.broadcast.to(acceptedOrder.socketID).emit("driverAccepts", driver)
                                        console.log('acceptedOrder 3 ', acceptedOrder.socketID)
                                    }
                                    else {
                                        // null is the result's end
                                    }
                                })
                            }
                        )
                    }
                }
                else {
                    // null is the result's end 
                }
            })
        })
    
        socket.on("passengerIsPickedUp", function(pickUpOrder, sendBackToClient) {
            var now = moment().format('DD-MM-YYYY HH:mm:ss Z')
            
            db.collection('orders').updateOne(
                { "id": pickUpOrder.id },
                { $set: { "status" : "PICKED-UP", "pickedUpTime" : now } },
                function(err, results) {
                    // Do something I've yet to find out lol
                }
            )
        })
    
        socket.on("passengerHasArrived", function(pickUpOrder, sendBackToClient) {
            var now = moment().format('DD-MM-YYYY HH:mm:ss Z')

            db.collection('orders').updateOne(
                { "id": pickUpOrder.id },
                { $set: { "status" : "ARRIVED", "arrivalTime" : now } },
                function(err, results) {
                    // Do something I've yet to find out lol
                }
            )

            // Signal the passenger's client that s/he has arrived
            socket.broadcast.to(pickUpOrder.socketID).emit("youHaveArrived")
        })
    
        socket.on("submitFeedBack", function(feedback, sendBackToClient) {
            db.collection('orders').updateOne(
                { "socketID": socket.id },
                { $set: { "feedback" : feedback } },
                function(err, results) {
                }
            )
            
            sendBackToClient()
        })
    
        socket.on("submitOrder", function(pickUpOrder, sendBackToClient) {
            var now = moment()
            pickUpOrder.timestamp = now.format('DD-MM-YYYY HH:mm:ss Z')
            // $rootScope.passengerData and $rootScope.driverData in client side must be regularly updated

            insertToDB(pickUpOrder)
        
            // Broadcast the event to every __ONLINE__ driver client
            var cursor = db.collection('drivers').find( { "status": "CONNECTED" } )
            
            cursor.each(function(err, document) {
                assert.equal(err, null);
                if (document !== null) {
                    socket.broadcast.to(document.socketID).emit("passengerFound", pickUpOrder)
                }
                else {
                    // null is the result's end
                }
            })
            console.log('287 ', pickUpOrder)
            sendBackToClient(pickUpOrder)
        })
    });
});

app.get('/', function (req, res) {
    // This event isn't really fired, it seems
    //console.log("user agent : %s", req.headers['user-agent'])
    //res.sendFile( docRoot + "/index.html" );
});

app.get('/iseng', function (req, res) {
    res.setHeader("X-Content-Security-Policy", "img-src 'self' data: https://csi.gstatic.com; script-src 'self' https://maps.googleapis.com");
    res.setHeader("Content-Security-Policy", "img-src 'self' data: https://csi.gstatic.com; script-src 'self' https://maps.googleapis.com");
    res.send("IP = " + req.connection.remoteAddress);
    console.log("IP = " + req.connection.remoteAddress)
});
// /\ Event Listeners /\

server.listen(port, address)// process.env.OPENSHIFT_NODEJS_IP || process.env.IP || '127.0.0.1');
console.log(`Running on ${address} with port ${port}`)