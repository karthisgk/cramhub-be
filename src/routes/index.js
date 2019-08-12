var path = require('path');
const fs = require('fs');

var common = require('../js/common.js');
var config = require('../config');

var User = new (require('./user.js'));
var Post = new (require('./post.js'));
var HashTag = new (require('./hashtag.js'));

var clearInput = common.clearInput;

function Routes(app){
	var self = this;
	var upload = common.getFileUploadMiddleware();

	app.get('/', (req, res) => { res.json({}) });
	app.post('/login', clearInput, User.Signin);
	app.post('/signup', clearInput, User.Signup);
	app.get('/validatetoken', clearInput, User.Validate_Token);
	app.post('/forgetpassword', clearInput, User.forgetPassword);
	app.post('/setpassword', clearInput, User.setPassword);
	app.post('/changepassword', User.auth(), clearInput, User.changePassword);
	app.get('/getme', User.auth(), clearInput, User.Get_Me);
	app.get('/logout', User.auth(), clearInput, User.SignOut);
	app.post('/updateuser', User.auth(), clearInput ,upload.single('avatar'), User.updateUser);

	app.get('/getuser/:type', User.auth(), clearInput, User.getUser);
	app.get('/getuser', User.auth(), clearInput, User.getUser);
	app.post('/gethashtags', User.auth(), clearInput, HashTag.getHashTag);

	app.post('/dopost', Post.getMulterObject(), User.auth(), Post.index, Post.saveImages);
	app.post('/getpost',  User.auth(), clearInput, Post.getData);

	app.post('/tiggerfollow', User.auth(), User.tiggerFollow);

	app.get('/image/:dir/:img', function(req, res){

		if(!req.params.hasOwnProperty('img')){
			res.send('404 Error');
			return;
		}
		var imgPath = __dirname + '/../uploads/' + req.params.dir + '/' + req.params.img;
		if (fs.existsSync(imgPath))
			res.sendFile(path.resolve(imgPath));
		else
			res.status(404).send('404 Error');
	});

	self.r = app;	
}

module.exports = Routes;

/*var request = require('request');
request.get('https://html.crumina.net/html-olympus/', function (error, response, body) {
    if (!error && response.statusCode == 200) {
        var csv = body;
        // Continue with your processing here.
        console.log(csv);
    }
});*/
