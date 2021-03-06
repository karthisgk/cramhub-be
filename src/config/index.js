
var DB = require('./db');
var SMTP = require('./SMTPmailConfig.js');
/*user: "smix.1234890@gmail.com",
	        pass: "1234.Smix"*/

var main = {
	development: {
		name: 'studypost',
		port: process.env.PORT || 3500
	},
	production: {
		name: 'studypost',
		port: process.env.PORT || 3500
	},
	db: new DB(),
	smtp_config: {
	    host: "smtp.gmail.com",
	    port: 465,
	    secure: true, 
	    auth: {
	        user: "",
	        pass: ""
	    }
	},
	session_time: 999999999999,
	liveUrl: 'http://cramapi.karthisgk.be/',
	initApp: function(dir){
		main.app_dir = dir;
		return main;
	},
	setSMTPConfig: function(cb){
		main.db.get('settings', {}, (settings) => {
			var smtp;
			if(settings.length > 0)
				smtp = new SMTP(settings[0].smtp_config);
			else
				smtp = new SMTP(main.smtp_config);
			cb(smtp);
		});
	}
};

module.exports = main;
