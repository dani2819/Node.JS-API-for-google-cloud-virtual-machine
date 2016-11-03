This service provides a thin-client computing service specifically targeted to mobile devices. 
The Application has the following functions:
* Allows the user to select a specific application from a list of supported ones (Open Office or Inkscape);
* prioritizes a specific application according to the current location of the mobile device;
* executes the chosen application by starting a suitable virtual machine;
* connects to such a virtual machine through a remote desktop protocol;
* shows the content of the remote virtual machine and allows the user to interact with the application;
* upon termination of the session, suspends or shuts down the virtual machine.

The backend is meant to be run locally, but it can also be deployed to cloud. The backend handles the authentication
of the user, as well as starting and stopping VM-instances and informing the user which applications are available
and when they can connect to them. Once a user logs in, a JSON Web Token is created and sent back to the user; this is
used in the subsequent requests to authenticate the user.
When a user connects to a VM, he connects to both the VM and a socket in the backend server. Once the connection to this
socket closes, all instances will be shut down after 5 seconds. If the user reconnects within those 5 seconds, the instances
will be left running.

The front-ends mainly request data from the user, send it to the server, and show the response. They are also
tasked with connecting the user to the VM.

## API
The communication between the front- and back-ends happens through a restfUll API, as shown below

* /login
--- POST
------ Logs the user in and generates a valid JSON web token for them
------ Parameters (JSON):
--------- username: name of the user
--------- password: password of the user (hashed with SHA-256)
------ Responses
--------- HTTP 200 (SUCCESS)
------------ Upon successful login
------------ Returns JSON with parameters
--------------- username: String; the username that was logged in
--------------- token: String; the jsonwebtoken for the user
--------------- login: String; "Success"
--------- HTTP 403 (NOT AUTHORIZED)
------------ Upon a failed login attempt due to wrong username and/or password
------------ Returns JSON with parameters
--------------- username: String; the username that was trying to log in
--------------- login: String; "Failure"

* /listInstance
--- POST
------ Returns the list of available applications for the given user
------ Parameters (JSON)
--------- token: String; the JSON web token for the authenticated  user
------ Responses
--------- HTTP 200 (SUCCESS)
------------ Returns JSON with parameters
--------------- name: String; name of the application
------------------ Currently supported names: "openoffice", "inkscape"
--------------- label: String; label of the application
--------------- description: String; Description for the application
--------- HTTP 403 (NOT AUTHORIZED)
------------ Upon a failed login attempt due to wrong username and/or password
------------ Returns JSON with parameters
--------------- username: String; the username that was trying to log in
--------------- login: String; "Failure"
--------- HTTP 500 (SERVER ERROR)
------------ Sent when something went wrong with the VM server. Most common reason for this is when the
backend server is not recognized due to incorrect credentials.
------------ Returns JSON with parameters
--------------- error: String; errormessage

* /appStart
--- POST
------ Starts the given application and returns connection details for it once it has started
------ Parameters (JSON)
--------- appName: String; the name of the application to start
--------- appToken: String; the JSON web token for the authenticated user
------ Responses
--------- HTTP 200 (SUCCESS)
------------ Returns JSON with parameters
--------------- ip: String; ip-address of the started VM
--------------- pass: String; the password for the VM
--------------- port_a: Integer; port numer to connect to with VNC protocol
--------------- port_w: Integer; port number for the connection socket. When this is closed, the VM is shut down
--------- HTTP 403 (UNAUTHORIZED)
------------ Sent when the JSON Web Token could not be authenticated
------------ Response contains no data
--------- HTTP 500 (SERVER ERROR)
------------ Sent when something went wrong with the VM server. Most common reason for this is when the
backend server is not recognized due to incorrect credentials.
------------ Returns JSON with parameters
--------------- error: String; errormessage

* /appStop
--- POST
------ Shuts down the given VM
------ Parameters (JSON)
--------- instancename: String; name of the app to shut down
--------- appToken: String; the JSON web token for the authenticated user
------ Responses
--------- HTTP 200 (SUCCESS)
------------ Returns JSON with parameters
--------------- shutdown: String; "success"
--------- HTTP 403 (UNAUTHORIZED)
------------ Sent when the JSON Web Token could not be authenticated
------------ Response contains a string: "Bad token"
--------- HTTP 500 (SERVER ERROR)
------------ Sent when something went wrong with the VM server. Most common reason for this is when the
backend server is not recognized due to incorrect credentials.
------------ Returns JSON with parameters
--------------- error: String; errormessage
