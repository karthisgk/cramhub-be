var common = require('../js/common.js');
var ObjectId = require('mongodb').ObjectId;
var config = require('../config/index.js');
var path = require('path');
const fs = require('fs');

function User() {
	var self = this;
	self.db = config.db;
	config.setSMTPConfig((smtp) => {
		this.smtp = smtp;
	});

	this.auth = function(){
		return function(req, res, next){

			if(req.headers.hasOwnProperty('token')){

				var token = req.headers.token;
				self.isValidAccessToken(token, (isValid, user) => {
					if(isValid){
						req.accessToken = token;
						req.accessUser = user;
						next();
					}
					else
						res.json(common.getResponses('005', {}));
				});

			}else
				next();
		};
	};

	this.isValidAccessToken = function(token, cb){
		self.db.get('user', {accessToken: {$all: [token]}, isDeleted: {$ne: 1}}, (data) => {
			if(data.length > 0)
			    cb(true, data[0]);
			else
				cb(false, data);
		});
	};

	this.getUser = function(req, res){

		if(!req.query.atUser && (!req.hasOwnProperty('accessToken') ||
			!req.hasOwnProperty('accessUser'))) {
			res.json(common.getResponses('005', {}));
			return;
		}

		var matchAnd = [];
		var lookups = [];
		lookups.push({ $project : { password: 0, Verification_Mail : 0 , accessToken : 0 } });
		if(typeof req.params.type !== 'undefined'){
			var UT = parseInt(req.params.type);
			matchAnd.push({User_Type: UT});
		}
		if(req.query.atUser)
			matchAnd.push({userId: req.query.atUser});
		else{			
			if(req.query.offset) {
				var lmt = typeof req.query.limit == 'undefined' ? 10 : req.query.limit;
				lmt = parseInt(req.query.offset) + lmt;
				lookups.push({ $limit: parseInt(lmt)});
				lookups.push({ $skip: parseInt(req.query.offset)});
			}
		}
		if(matchAnd.length > 0){
			lookups.push({
				$match: {
					$and: matchAnd
				}
			});
		}
		self.db.connect((db) => {
			db.collection('user').aggregate(lookups, (err, user) => {

				var rt = {activeUser: [], inactiveUser: []};
				if(user.length > 0){
					user.forEach((u, k) => {
						if(u.hasOwnProperty('avatar'))
							u.avatar = config.liveUrl + 'image/avatars/' + u.avatar;
						if(u.hasOwnProperty('DOB')){
							var dob = u.DOB.split('-');
							if(dob.length > 2)
								u.DOB = dob[2] + '/' + dob[1] + '/' + dob[0];
						}
						if(typeof u.isDeleted != 'undefined'){
							if(u.isDeleted == 1)
								rt.inactiveUser.push(u);
							else
								rt.activeUser.push(u);
						}
						else
							rt.activeUser.push(u);
					});
				}

				res.json(common.getResponses('020', rt));
		  	});
		});
	};

	this.Signin = function(req, res){

		if(typeof req.body.email == 'undefined' ||
			typeof req.body.password == 'undefined'){
			res.json(common.getResponses('003', {}));
			return;
		}

		var cond = {
			$and: [
				{$or: [
					{Email_Id: req.body.email},
					{userId: req.body.email}
				]},
				{isDeleted: {$ne: 1}}
			]
		};
		self.db.get('user', cond, (data) => {
			if(data.length == 0){
				res.json(common.getResponses('004', {}));
			}else{

				var ind = -1;
				data.forEach((usr, k) => {
					if(typeof usr.password != 'undefined'){
						if(common.validatePassword(usr.password, req.body.password))
							ind = k;
					}
				});

				if(ind == -1 || ind >= data.length){
					res.json(common.getResponses('034', {}));
					return;
				}

				var matchUser = data[ind];
				if(matchUser.isActivated == 1){
					var token = common.getCrptoToken(32);
					var tokens = !matchUser.hasOwnProperty('accessToken') || typeof matchUser.accessToken.length == 'undefined'
					|| typeof matchUser.accessToken == 'string' ? [] : matchUser.accessToken;
					tokens.push(token);
					self.db.update('user', {_id: matchUser._id}, {accessToken: tokens}, (err, result) => {
						res.json(common.getResponses('020', {accessToken: token,
						User_Type: matchUser.User_Type}));
					});
				}else
					res.json(common.getResponses('023', {}));
			}
		});
	};

	this.SignOut = function(req, res){
		if(!req.hasOwnProperty('accessToken') || !req.hasOwnProperty('accessUser')){
			res.json(common.getResponses('005', {}));
			return;
		}

		var data = req.accessUser;
		var tokens = !data.hasOwnProperty('accessToken') || typeof data.accessToken.length == 'undefined'
			|| typeof data.accessToken == 'string' ? [] : data.accessToken;
		tokens.splice(tokens.indexOf(req.accessToken), 1);
		self.db.update('user', {_id: data._id}, {accessToken: tokens}, (err, result) => {
			res.json(common.getResponses('024', {}));
		});
	};

	this.Get_Me = function(req, res){
		if(!req.hasOwnProperty('accessToken') || !req.hasOwnProperty('accessUser')){
			res.json(common.getResponses('005', {}));
			return;
		}
		var token = req.accessToken;
		var user = req.accessUser;
		if(user.hasOwnProperty('avatar'))
			user.avatar = config.liveUrl + 'image/avatars/' + user.avatar;
		if(user.hasOwnProperty('DOB')){
			var dob = user.DOB.split('-');
			if(dob.length > 2)
				user.DOB = dob[2] + '/' + dob[1] + '/' + dob[0];
		}
		delete user.password;
		delete user.accessToken;
		delete user.Verification_Mail;

		if(req.accessUser.chatConversations){
			var cts = typeof user.chatConversations == 'string'
			 ? [user.chatConversations]
			 : user.chatConversations;
			self.db.get('user', {chatConversations: {$elemMatch: {$in: cts}},
				_id: {$ne: user._id}}, (users) => {
					user.chatUsers = users;
					res.json(common.getResponses('020', user));
			});
		}else
	  	res.json(common.getResponses('020', user));
	};


	this.Signup = function(req, res){
		if(!req.body.First_Name ||
			!req.body.Email_Id ||
			!req.body.password ||
			!req.body.cpassword){
			res.json(common.getResponses('003', {}));
			return;
		}

		if(req.body.password != req.body.cpassword){
			res.json(common.getResponses('025', {}));
			return;
		}

		var verifyToken = common.getCrptoToken(32);
		var Verification_Mail = {
			token: verifyToken,
			gtime: common.current_time()
		};

		var cond = {Email_Id: req.body.Email_Id};
		self.db.get('user', cond, (data) => {
			if(data.length > 0){
				if(data[0].password){
					if(data[0].isActivated == 0){
						var link = common.frontEndUrl + "validateuser?token="
							+ verifyToken;
						var UPD = {Verification_Mail: Verification_Mail};
						self.db.update('user', {_id: data[0]._id}, UPD, (err, result) => {
							self.verificationMail(link, req.body.Email_Id, "Activation");
							res.json(common.getResponses('009', {type: 1}));
						});
					}else
						res.json(common.getResponses('015', {}));
				}
				else{
					var link = common.frontEndUrl + "setpassword?token="
					+ verifyToken + "&reset=false";
					var UPD = {Verification_Mail: Verification_Mail};
					self.db.update('user', {_id: data[0]._id}, UPD, (err, result) => {
						self.verificationMail(link, data[0].Email_Id, "Generate Password");
						res.json(common.getResponses('008', {type: 2}));
					});
				}
			}else{
				var newUser = {
					_id: common.getMongoObjectId(),
					First_Name: req.body.First_Name,
					Last_Name: req.body.Last_Name ? req.body.Last_Name : '',
					Email_Id: req.body.Email_Id,
					password: common.getPasswordHash(req.body.password),
					User_Type: common.getUserType(1),
					isActivated: 0,
					Verification_Mail: Verification_Mail
				};
				newUser.userId = newUser.Email_Id.split('@')[0];
				var link = common.frontEndUrl + "validateuser?token="
					+ verifyToken;
				self.db.insert('user', newUser, (err, result) => {
			    	self.verificationMail(link, req.body.Email_Id, "Activation");
					res.json(common.getResponses('009', {type: 1}));
			    });
			}
		});
	};

	this.verificationMail = function(link, UEmail, subject){

		var hitSend = (settings, TO, subject) => {
			var title = settings.length > 0 ? settings[0].title : '';
			var adminMail = settings.length > 0 ?
				settings[0].smtp_config.auth.user : config.smtp_config.auth.user;
			var content = '<h3>'+title+'</h3>';
			content += '<p><a href="'+link+'">click here to do action</a></p>';
			self.smtp.getFile({title: title, content: content}, (d) => {
				var mail = {
				    from: adminMail,
				    to: TO,
				    subject: title +" - " + subject,
				    html: d.html
				};
				self.smtp.sendMail(mail, (err, res) => {
					if (err) {console.log(err);}
				});
			});
		};

		self.db.get('settings', {}, (settings) => {
			hitSend(settings, UEmail, subject);
		});

	};

	this.forgetPassword = function(req, res){

		if(!req.body.Email_Id){
			res.json(common.getResponses('003', {}));
			return;
		}

		self.db.get('user', {Email_Id: req.body.Email_Id}, (data) => {
			if(data.length == 0)
				res.json(common.getResponses('017', {}));
			else{
				var verifyToken = common.getCrptoToken(32);
				var Verification_Mail = {
					token: verifyToken,
					gtime: common.current_time()
				};
				var link = common.frontEndUrl + "setpassword?token="
				+ verifyToken + "&reset=false";
				var UPD = {Verification_Mail: Verification_Mail};
				self.db.update('user', {_id: data[0]._id}, UPD, (err, result) => {
					self.verificationMail(link, data[0].Email_Id, "Reset Password");
					res.json(common.getResponses('029', {}));
				});
			}
		});
	};

	this.setPassword = function(req, res){
		if(!req.body.verifyToken){
			res.json(common.getResponses('006', {}));
			return;
		}

		if(!req.body.New_Password ||
			!req.body.Confirm_Password){
			res.json(common.getResponses('003', {}));
			return;
		}

		if(req.body.New_Password != req.body.Confirm_Password){
			res.json(common.getResponses('025', {}));
			return;
		}

		var token = req.body.verifyToken;
		self.isValidToken(token, (data, isValid, isExpired) => {
			if(isValid && isExpired){
				res.json(common.getResponses('007', {}));
			}
			else if(isValid && !isExpired){
				var UPD = {
					password: common.getPasswordHash(req.body.New_Password),
					isActivated: 1,
					Verification_Mail: {}
				};
				/*self.mailForPasswordChange(data[0].Email_Id);*/
				self.db.update('user', {_id: data[0]._id}, UPD, (err, result) => {
					res.json(common.getResponses('028', {}));
				});
			}else{
				res.json(common.getResponses('006', {}));
			}
		});

	};

	this.changePassword = function(req, res){
		if(!req.hasOwnProperty('accessToken') || !req.hasOwnProperty('accessUser')){
			res.json(common.getResponses('005', {}));
			return;
		}

		if(!req.body.New_Password ||
			!req.body.Confirm_Password ||
			!req.body.Old_Password){
			res.json(common.getResponses('003', {}));
			return;
		}

		if(req.body.New_Password != req.body.Confirm_Password){
			res.json(common.getResponses('025', {}));
			return;
		}

		if(!common.validatePassword(req.accessUser.password, req.body.Old_Password) ){
			res.json(common.getResponses('034', {}));
			return;
		}

		var UPD = {
			password: common.getPasswordHash(req.body.New_Password)
		};
		self.db.update('user', {_id: req.accessUser._id}, UPD , (err, result) => {
			/*self.mailForPasswordChange(req.accessUser.Email_Id);*/
			res.json(common.getResponses('028', {}));
		});

	};

	this.Validate_Token = function(req, res){

		if(!req.query.token){
			res.json(common.getResponses('006', {}));
			return;
		}
		var token = req.query.token;
		self.isValidToken(token, (data, isValid, isExpired) => {
			if(isValid && isExpired){
				res.json(common.getResponses('007', {}));
			}
			else if(isValid && !isExpired){
				var UPD = {isActivated: 1, Verification_Mail: {}};
				if(req.query.reset){
					if(req.query.reset == 'false')
						delete UPD.Verification_Mail;
				}
				self.db.update('user', {_id: data[0]._id}, UPD, (err, result) => {
					res.json(common.getResponses('027', {}));
				});
			}else{
				res.json(common.getResponses('006', {}));
			}
		});
	};

	this.isValidToken = function(token, cb){
		self.db.get('user', {"Verification_Mail.token": token}, (data) => {
			if(data.length > 0){
				var ct = common.current_time();
				var gt = new Date(data[0].Verification_Mail.gtime);
				gt = common.current_time(
					common.addHours(gt, 0.5));
				if(ct <= gt )
					cb(data, true, false);
				else
					cb(data, true, true);
			}
			else
				cb(data, false, false);
		});
	};

	this.updateUser = function(req, res) {
		if(!req.hasOwnProperty('accessToken') || !req.hasOwnProperty('accessUser')){
			res.json(common.getResponses('005', {}));
			return;
		}

		var UPD = {};
		if(req.body.First_Name)
			UPD.First_Name = req.body.First_Name;
		if(req.body.Last_Name)
			UPD.Last_Name = req.body.Last_Name;
		if(req.body.Gender)
			UPD.Gender = req.body.Gender;
		if(req.body.univ)
			UPD.univ = req.body.univ;
		if(req.body.location)
			UPD.location = req.body.location;
		if(req.body.DOB){
			UPD.DOB = req.body.DOB;
			var dob = UPD.DOB.split('/');
			if(dob.length > 2)
				UPD.DOB = dob[2] + '-' + dob[1] + '-' + dob[0];
		}


		var avatarExt = avatarFileName = avatarTargetPath = '';
		var avatarDir = './src/uploads/avatars/';
		if(typeof req.file != 'undefined'){
			if(typeof req.file.path != 'undefined'){
				var removeUpload = function(){
					if (fs.existsSync(req.file.path))
						fs.unlinkSync(req.file.path);
				};
				try {
					if (!fs.existsSync(avatarDir))
					    fs.mkdirSync(avatarDir);
				} catch (err) {
					removeUpload();
					res.json(common.getResponses('035', {}));
					return;
				}

				if(typeof req.fileError != 'undefined'){
					removeUpload();
					res.json(common.getResponses(req.fileError, {}));
					return;
				}

				var avatarExt = path.extname(req.file.path);
				if(avatarExt == '.pdf'){
					removeUpload();
					res.json(common.getResponses('038', {}));
					return;
				}
				avatarFileName = 'SGK_' + req.accessUser._id + avatarExt;
				avatarTargetPath = avatarDir + avatarFileName;
				UPD.avatar = avatarFileName;
				try {
		       		fs.renameSync(req.file.path, avatarTargetPath);
		       	} catch (err) {
		       		res.json(common.getResponses('035', {}));
					return;
		       	}
		    }
		}

		self.db.update('user', {_id: req.accessUser._id}, UPD, (err, result) => {
			res.json(common.getResponses('002', {avatarDir: config.liveUrl + 'image/avatars/'}));
		});
	};
}

module.exports = User;

/*this.state = {
    posts: [
        {
    		id: 12, 
    		avatar: authorImg,
    		name: 'asdsad', 
    		time : '12 hrs Ago',
            youtubeLinks: "https://youtube.com/watch?v=excVFQ2TWig;https://www.youtube.com/watch?v=0_prnDt5IZg",
            images: [postImg],
            whoLikes: [{id: 14, avatar: authorImg}],
            comment: [
            	{
            		id: 12,
            		avatar: authorImg,
            		name: 'asdsad',
            		time : '12 hrs Ago',
            		likes: 12,
            		message: 'Ratione voluptatem sequi en lod nesciunt. Neque porro quisquam est, quinder dolorem ipsum\
            		quia dolor sit amet, consectetur adipisci velit en lorem ipsum duis aute irure dolor in reprehenderit in voluptate velit esse cillum.'
        		}
        	],
            content: 'Ratione voluptatem sequi en lod nesciunt. Neque porro quisquam est, quinder dolorem ipsum\
            quia dolor sit amet, consectetur adipisci velit en lorem ipsum duis aute irure dolor in reprehenderit in voluptate velit esse cillum.'
        }
    ]            
}*/
