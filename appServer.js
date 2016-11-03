// config
var allowedUsers = {user: '9d4e1e23bd5b727046a9e3b4b7db57bd8d6ee684'}; // username:password_hash
var projectName = "mcc-2016-g09-p1";
var regionName = "europe-west1";
var zoneName = "europe-west1-c";
var secret = "SECRET";

// require modules
var express = require('express');
var bodyParser = require('body-parser');
var fs = require('fs');
var google = require('googleapis');
var jwt = require('jsonwebtoken');
var ws = require("nodejs-websocket");
var tcpPortUsed = require('tcp-port-used');

// init
var app = express();
var compute = google.compute('v1');
// var crypto = require('crypto');
// var shasum = crypto.createHash('sha1');
var urlencodedParser = bodyParser.urlencoded({extended: false});
app.use(bodyParser.json());


function isAuthorizedUser(username, passwordHash) {
    return allowedUsers.hasOwnProperty(username)
        && allowedUsers[username] == passwordHash;
}

function generateToken(req) {
    var expiresDefault = Math.floor(new Date().getTime() / 1000) + 7 * 24 * 60 * 60;

    var token = jwt.sign({
        auth: 'secret',
        agent: req.headers['user-agents'],
        exp: expiresDefault
    }, secret);
    return token;
}

function verify(token) {
    var decoded = false;
    try {
        decoded = jwt.verify(token, secret);
    } catch (e) {
        decoded = false; // still false
    }
    return decoded;
}

function workWithAuthClient(response, onSuccess) {
    google.auth.getApplicationDefault(function (err, authClient) {
        if (err) {
            console.log('Authentication failed because of ', err);
            send500Error(response);
            return false;
        }
        if (authClient.createScopedRequired && authClient.createScopedRequired()) {
            var scopes = ['https://www.googleapis.com/auth/cloud-platform'];
            authClient = authClient.createScoped(scopes);
        }

        var requestBase = {
            project: projectName,
            region: regionName,
            zone: zoneName,
            auth: authClient
        };
        onSuccess(authClient, requestBase);
    });
}

function sendError(response, responseCode, errorMessage) {
    console.log("ERROR: " + errorMessage);
    sendJsonResponse(response, responseCode, {error: errorMessage});
}

function send403Error(response) {
    sendError(response, 403, "Unauthorized");
}

function send500Error(response) {
    sendError(response, 500, "Server error");
}

function authenticateOrDie(response, token) {
    var decoded = verify(token);

    if (!decoded || decoded.auth !== 'secret') {
        console.log("Authentication failed for token '" + token + "' (decoded: '" + decoded + "')");
        send403Error(response);
        return false;
    }

    console.log("Authenticated");

    return true;
}

function sendJsonResponse(response, responseCode, contents) {
    console.log("JSON response: " + JSON.stringify(contents));
    response.writeHead(responseCode, {'content-type': 'application/json'});
    response.end(JSON.stringify(contents));
}

function startComputeInstance(response, instanceParams, onSuccess) {
    compute.instances.start(instanceParams, function (err, result) {
        if (err) {
            console.log('Instance start failed because of ', err);
            send500Error(response);
            return false;
        }

        // for debugging
        // console.log(result);

        onSuccess(result);
    });
}

function getComputeInstance(response, instanceParams, onSuccess) {
    compute.instances.get(instanceParams, function (err, result) {
        if (err) {
            console.log('Instance retrieval failed because of ', err);
            send500Error(response);
            return false;
        }

        // for debugging
        // console.log("compute.instances.get result:"); console.log(result);

        // return only interesting data
        var instanceDetails = {
            status: result.status,
            externalIp: result.networkInterfaces[0].accessConfigs[0].natIP
        };

        onSuccess(instanceDetails);
    });
}

function getComputeInstanceWhenReady(response, instanceParams, onReady) {
    var ready = 'RUNNING';

    getComputeInstance(response, instanceParams, function(instanceDetails){
        if (instanceDetails.status == ready && instanceDetails.externalIp !== undefined) {
            onReady(instanceDetails);
        } else {
            console.log("Instance not ready, waiting: "+JSON.stringify(instanceDetails));
            setTimeout(function() {
                getComputeInstanceWhenReady(response, instanceParams, onReady);
            }, 1000);   // sleep one second
        }
    });
}

function listComputeInstances(response, instancesParams, onSuccess) {
    compute.instances.list(instancesParams, function (err, result) {
        if (err) {
            console.log('Instances list retrieval failed because of ', err);
            send500Error(response);
            return false;
        }

        // for debugging
//         console.log("compute.instances.list result:"); console.log(result);

        var instanceList = {};
        instanceList = result.items.map(function (out) {
            var label;
            for (var i in out.metadata.items) {
                if (out.metadata.items[i].key  == "label") {
                    label = out.metadata.items[i].value;
                    break;
                }
            }
            return {
                name: out.name,
                description: out.description,
                label: label === undefined ? out.name : label
            };
        });

        onSuccess(instanceList);
    });
}

// GET /login
app.get('/login', function (req, res) {
    fs.readFile('form.html', function (err, data) {
        res.writeHead(200, {
            'Content-Type': 'text/html',
            'Content-Length': data.length
        });
        res.write(data);
        res.end();
    });
});

// POST /login
// username=<username>&password=<password_hash>
app.post('/login', urlencodedParser, function (req, res) {
    var nameValue = req.body.username;
    var passValue = req.body.password

    var loginJSON = {
        username: nameValue,
        token: "",
        login: ""
    };

    if (isAuthorizedUser(nameValue, passValue)) {
        console.log("Logged in, user: " + nameValue);
        loginJSON.login = "Success";
        loginJSON.token = generateToken(req);
        sendJsonResponse(res, 200, loginJSON);
    } else {
        console.log("Login failed for " + nameValue);
        loginJSON.login = "Failure";
        sendJsonResponse(res, 403, loginJSON);
    }
});

//Start of instance starting
app.get('/appStart', function (req, res) {
    fs.readFile('appStart.html', function (err, data) {
        res.writeHead(200, {
            'Content-Type': 'text/html',
            'Content-Length': data.length
        });
        res.write(data);
        res.end();
    });
});

app.post('/appStart', urlencodedParser, function (req, res) {
    console.log("POST /appStart   with appName="+req.body.appName);
    if (!authenticateOrDie(res, req.body.appToken)) {
        return;
    }

    var appName = req.body.appName;

    workWithAuthClient(res, function (authClient, instanceParams) {
        instanceParams.instance = appName;

        startComputeInstance(res, instanceParams, function (result) {
//            console.log("START INSTANCE results:");console.log(result);

            // check if IP is available and status is RUNNING, otherwise wait!
            getComputeInstanceWhenReady(res, instanceParams, function (instanceDetails) {
//                console.log("INSTANCE DETAILS:");console.log(instanceDetails);
                console.log("Instance "+appName+" ready, waiting for the VNC port");

                var whenPortReady = function(){
                    responseContents = {
                        ip: instanceDetails.externalIp,
                        port_a: 5901,
                        port_w: 6080,
                        pass: 'passpass'
                    };
                    sendJsonResponse(res, 200, responseContents);
                };

                tcpPortUsed.waitUntilUsedOnHost(6080, instanceDetails.externalIp, 1000, 20000)
                // for some reason, even when the port is ready, it throws a mistake
                // so let's just try to connect to VNC either way
                .then(whenPortReady, whenPortReady);
            });
        });
    });
});

app.get('/appStop', function (req, res) {
    fs.readFile('appStop.html', function (err, data) {
        res.writeHead(200, {
            'Content-Type': 'text/html',
            'Content-Length': data.length
        });
        res.write(data);
        res.end();
    });
});

app.post('/appStop', urlencodedParser, function (req, res) {
    var appToken;
    appToken = req.body.appToken;
    //Token verification done here -->
    var decoded = verify(appToken);

    if (!decoded || decoded.auth !== 'secret') {
        res.writeHead(403, {
            'content-type': 'text/plain'
        });
        res.end("Bad token");
        res.end();
    } else {
        google.auth.getApplicationDefault(function (err, authClient) {
            if (err) {
                console.log('Authentication failed because of ', err);
                return;
            }
            if (authClient.createScopedRequired && authClient.createScopedRequired()) {
                var scopes = ['https://www.googleapis.com/auth/cloud-platform'];
                authClient = authClient.createScoped(scopes);
            }

            var request = {
                project: "mcc-2016-g09-p1",
                zone: "europe-west1-c",
                instance: req.body.instancename,
                auth: authClient
            };

            compute.instances.stop(request, function (err, result) {
                if (err) {
                    console.log(err);
                    res.end("Instance stop failure");
                } else {
                    console.log(result);
                    res.end("Instance stop success");
                }
            });
        });
    }
});

function stopInstance(instanceName){
     google.auth.getApplicationDefault(function (err, authClient) {
            if (err) {
                console.log('Authentication failed because of ', err);
                return;
            }
            if (authClient.createScopedRequired && authClient.createScopedRequired()) {
                var scopes = ['https://www.googleapis.com/auth/cloud-platform'];
                authClient = authClient.createScoped(scopes);
            }

            var request = {
                project: "mcc-2016-g09-p1",
                zone: "europe-west1-c",
                instance: instanceName,
                auth: authClient
            };

            compute.instances.stop(request, function (err, result) {
                if (err) {
                    console.log(err);
                   
                } else {
                    console.log(result);
                }
            });
        });
}

// List instances
// POST /listInstance
app.post('/listInstance', urlencodedParser, function (req, res) {
    if (!authenticateOrDie(res, req.body.appToken)) {
        return;
    }

    workWithAuthClient(res, function (authClient, instancesParams) {
        listComputeInstances(res, instancesParams, function (instancesList) {
            sendJsonResponse(res, 200, instancesList);
        });
    });
});

// Serve our static files
app.use("/", express.static(__dirname + "/../frontend/web"));

// SOCKETS
var timer;
var socketServer = ws.createServer(function (conn) {
    console.log('WebSocket connection opened');
    clearTimeout(timer);
    conn.on("close", function (code, reason) {
        console.log('WebSocket connection closed');
        /*  closing both (no multi-user support requested) instances
                when socket closes after 5 seconds.
            basically prevents instances from closing with browser refresh.
            if user connects again in that period then we do not close the instances
        */
        timer = setTimeout(function() {
            console.log('CLOSING APPS!');
            stopInstance('openoffice');
            stopInstance('inkscape');
        }, 5000);

    })
}).listen(3030);

var server = app.listen(8080, function () {
    var port = server.address().port;
    console.log("Application Server listening at http://localhost:%s", port);
});
