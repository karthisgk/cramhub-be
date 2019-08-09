var common = require('../js/common.js');
var config = require('../config');

function HashTag(){
	this.getHashTag = (req, res) => {

		if(!req.body.searchText || req.body.searchText.length <= 3){
			res.json(common.getResponses('003', []));
			return;
		}

		var callBack = (capt) => { res.json(common.getResponses('020', capt)) };		
		var type = req.query.type ? parseInt(req.query.type) : 1;
		var isAt = type == 1 && /^@/ig.test(req.body.searchText);
		if(isAt){
			this.getUserId(req, callBack, type);
			return;
		}
		this.getCaptionToo(req, callBack, type);
	};
}

HashTag.prototype.getCaptionToo = (req, cb, type = 2)  => {

	var searchText = req.body.searchText;
	searchText = searchText.replace(/\\/g, '\\\\');
	var matchAnd = [];
	this.post = new (require('./post.js'));
	var lookups = this.post.getInitialLookups({user: true});
	lookups.push({ $project : { univ: 1, caption: 1, "user.univ": 1} });
	var $pattern = new RegExp(searchText.replace(/^#/, '').replace(/_/ig, ' '), 'i');
	var $or = [ {univ: {$regex: $pattern}}, {"user.univ": {$regex: $pattern}} ];
	var isHashTag = type == 1 && /^#/ig.test(searchText);
	
	if(isHashTag)
		$or.push( {caption: {$regex: new RegExp(searchText, 'i') }} );	

	matchAnd.push({
		$or: $or
	});
	if(matchAnd.length > 0){
		lookups.push({
			$match: {
				$and: matchAnd					
			}
		});
	}

	if(req.query.offset) {
		var lmt = typeof req.query.limit == 'undefined' ? 10 : req.query.limit;
		lmt = parseInt(req.query.offset) + lmt;
		lookups.push({ $limit: parseInt(lmt)});
		lookups.push({ $skip: parseInt(req.query.offset)});
	}

	config.db.customGetData('post', lookups,  (err, pst) => {
		var rt = [];
		if(pst.length > 0){
			pst.forEach((u, k) => {
				if(new RegExp(searchText, 'i').test(u.caption)){
					var caption = searchText;
					var captionArray = u.caption.split(searchText);
					if(captionArray.length > 1){
						caption = captionArray[1].split(" ").length > 0 ?
						caption + captionArray[1].split(" ")[0] : caption;
					}
					rt.push(caption);
				}
				if($pattern.test(u.univ))
					rt.push(type == 1 ? '#' + u.univ.replace(/ /ig, '_') : u.univ);
				if($pattern.test(u.user.univ))
					rt.push(type == 1 ? '#' + u.user.univ.replace(/ /ig, '_') : u.user.univ);
			});
		}
		cb(common.getDistinctArray(rt));
	});
};

HashTag.prototype.getUserId = (req, cb, type = 2) => {
	var searchText = req.body.searchText;
	var isAt = type == 1 && /^@/ig.test(searchText);
	if(!isAt){
		cb([]);
		return;
	}
	var atPattern = new RegExp(searchText.replace(/^@/, ''), 'i');
	var userLookups = [
		{
			$match: {userId: {$regex: atPattern }}
		}
	];
	if(req.query.offset) {
		var lmt = typeof req.query.limit == 'undefined' ? 10 : req.query.limit;
		lmt = parseInt(req.query.offset) + lmt;
		userLookups.push({ $limit: parseInt(lmt)});
		userLookups.push({ $skip: parseInt(req.query.offset)});
	}
	config.db.customGetData('user', userLookups,  (err, pst) => {
		var rt = [];
		if(pst.length > 0){
			pst.forEach((user, k) => {
				if(type == 1 && new RegExp(searchText.replace(/^@/, ''), 'i').test(user.userId) ){
					if(!req.query.search)
						rt.push( '@' + user.userId);
					else{
						var obj = {};
						obj.name = '@' + user.userId;
						if(user.avatar)
							obj.avatar = config.liveUrl + 'image/avatars/' + user.avatar;
						rt.push( obj );
					}
				}
			});
		}
		cb(common.getDistinctArray(rt));
	});
}

module.exports = HashTag;