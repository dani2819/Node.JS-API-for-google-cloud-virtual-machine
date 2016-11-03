var express = require('express');
var formidable = require("formidable");
var app = express();
var fs = require('fs');

var google = require('googleapis');
var compute = google.compute('v1');

//Start of list instances
//app.get('/listInstance', function (req, res) {
//    fs.readFile('appStop.html', function (err, data) {
//        res.writeHead(200, {
//            'Content-Type': 'text/html'
//            'Content-Length': data.length
//        });
//        res.write(null);
//        res.end();
//	});
//});

app.get('/listInstance', function (req, res) {
    google.auth.getApplicationDefault(function(err, authClient) {
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
            region: "europe-west1",
//          address: "inst-1",
            zone: "europe-west1-d",
            auth: authClient
        };

        compute.instances.list(request, function(err, result) {
            if (err) {
                console.log(err);
            } else {
                var instanceOut = {
                    id: result.items.map(function (out){return out.id;}),
                    name: result.items.map(function (out){return out.name;}),
                    description: result.items.map(function (out){return out.description;}),
                    status: result.items.map(function (out){return out.status;})
                };
                console.log(instanceOut);
                res.writeHead(200, {
                    'Content-Type': 'text/html'
                //    'Content-Length': printResult.length
                });
                res.end(JSON.stringify(instanceOut));
//                res.end();
            }
        });
    });
});
//End of list instances

var server = app.listen(8081, function () {
   var port = server.address().port;
   console.log("Instance Server listening at http://localhost:%s", port);
});