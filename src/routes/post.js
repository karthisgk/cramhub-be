var common = require('../js/common.js');
var ObjectId = require('mongodb').ObjectId;
var config = require('../config/index.js');
var path = require('path');
const fs = require('fs');

function Post() {
	
}

Post.prototype.index = function(req, res, next) {

	if(!req.hasOwnProperty('accessToken') ||
		!req.hasOwnProperty('accessUser')){
		res.json(common.getResponses('005', {}));
		return;
	}

	if(!req.body.caption ||
		!req.body.univ ||
		!req.body.youtubeLinks ||
		!req.body.studyContent) {
		res.json(common.getResponses('003', {}));
		return;
	}

	var dbFields = {		
		caption: req.body.caption,
		univ: req.body.univ,
		youtubeLinks: req.body.youtubeLinks,
		studyContent: req.body.studyContent,
		codeContent: req.body.codeContent ? req.body.codeContent : '',
		userId: req.accessUser._id,
		likes: []
	};

	var dbAction = function(actionData, cb){
		if(!req.body.postId){
			actionData.images = [];
			actionData._id = common.getMongoObjectId();
			actionData.createdDate = common.current_time();
			config.db.insert('post', actionData, (err, result) => {
				cb(actionData._id);
			});
		}
		else{
			config.db.update('post', {_id: req.body.postId}, actionData, (err, result) => {
				cb(req.body.postId);
			});
		}
	};

	dbAction(dbFields, postId => {
		req.onAfterUploadCallback = postId => {
			res.json(common.getResponses('020', {postId: postId}));
		};
		req.postId = postId;
		next();
	});
};

Post.prototype.getMulterObject = function(){
	return common.getFileUploadMiddleware({
		uploadDir: 'post/'
	}).array('images');
};

Post.prototype.saveImages = function(req, res) {
	if(!req.hasOwnProperty('postId') ||
		!req.hasOwnProperty('onAfterUploadCallback')){
		res.json(common.getResponses('020', {}));
		return;
	}

	var dbFieldImages = [];
	if(req.hasOwnProperty('files')) {
		if(req.files.length > 0) {
			req.files.forEach((file, k) => {
				if (fs.existsSync(file.path))
					dbFieldImages.push(file.filename);
			});
		}
	}

	var callBack = (err, result) => {
		req.onAfterUploadCallback(req.postId);
	};
	var $wh = {_id: req.postId};
	var UPD = {images: []};
	config.db.get('post', $wh, post => {
		if(post.length > 0){
			post = post[0];
			UPD.images = post.images.concat(dbFieldImages);
			if(req.body.removedImage && typeof req.body.removedImage.length == 'number'){
				if(req.body.removedImage.length > 0){
					req.body.removedImage.forEach((file, k) => {
						if(UPD.images.indexOf(file) != -1 && UPD.images.length > 1) {
							UPD.images.splice(UPD.images.indexOf(file), 1);
							if (fs.existsSync('./src/uploads/post/' + file))
								fs.unlinkSync('./src/uploads/post/' + file);
						}
					});
				}
			}
			if(UPD.images.length > 0)
				config.db.update('post', $wh, UPD, callBack);
			else
				req.onAfterUploadCallback(req.postId);
		}else
			req.onAfterUploadCallback(req.postId);
	});
};


Post.prototype.getInitialLookups = (dbCollection = {}) => {
	var mergeObjects = ["$$ROOT"];
	var lookups = [];
	if(dbCollection.user){
		lookups.push({
			$lookup: {
				from: 'user',
				localField: 'userId',
				foreignField: '_id',
				as: 'user'
			}
		});
		mergeObjects.push({user: { $arrayElemAt: [ "$user", 0 ] }});
	}
	if(dbCollection.comments){
		lookups.push({
			$lookup: {
				from: 'comments',
				localField: '_id',
				foreignField: 'postId',
				as: 'comments'
			}
		});
		mergeObjects.push({comments: { $arrayElemAt: [ "$comments", 0 ] }});
	}
	lookups.push({
		$replaceRoot: {
	        newRoot: {
	            $mergeObjects: mergeObjects
	        }
	    }
    });
	return lookups;
};

Post.prototype.getData = (req, res) => {

	var $this = new Post();
	var lookups = $this.getInitialLookups({user: true, comments: true});
	lookups.push({ $project : { "user.password": 0, "user.Verification_Mail" : 0 , "user.accessToken" : 0 } });
	var sortAsDesc = typeof req.query.sortAsDesc != 'undefined' ? -1 : 1;
	if(req.query.sortBy){
		if(['caption', 'studyContent', 'codeContent', 'univ'].indexOf(req.query.sortBy) > -1){
			var sortObject = {};
			sortObject[req.query.sortBy] = sortAsDesc;
			lookups.push({ $sort : sortObject });
		}
		else
			lookups.push({ $sort : {createdDate: sortAsDesc} });
	}else
		lookups.push({ $sort : {createdDate: sortAsDesc} });

	if(req.body.searchText){
		var searchText = req.body.searchText;
		var $pattern = new RegExp(searchText, 'i');
		lookups.push({
			$match: {
				$or: [
					{caption: {$regex: $pattern}},
					{univ: {$regex: $pattern}},
					{studyContent: {$regex: $pattern}},
					{codeContent: {$regex: $pattern}},
					{"user.name": {$regex: $pattern}},
					{"user.univ": {$regex: $pattern}}
				]
			}
		});
	}

	if(req.body.hashTag) {
		var hashTag = req.body.hashTag;
		if(/^#/ig.test(hashTag)) {
			var $pattern = new RegExp(hashTag, 'i');
			lookups.push({
				$match: {
					$or: [
						{caption: {$regex: $pattern}},
						{"user.univ": {$regex: $pattern}}
					]
				}
			});
		}
	}

	if(req.body.atUser) {
		var atUser = req.body.atUser;
		lookups.push({
			$match: {
				$and: [
					{"user.userId": atUser}
				]
			}
		});
	}

	if(req.query.offset) {
		var lmt = typeof req.query.limit == 'undefined' ? 10 : req.query.limit;
		lmt = parseInt(req.query.offset) + lmt;
		lookups.push({ $limit: parseInt(lmt)});
		lookups.push({ $skip: parseInt(req.query.offset)});
	}

	config.db.customGetData('post', lookups,  (err, data) => {
		res.json(common.getResponses('020', data));
	});

};


module.exports = Post;