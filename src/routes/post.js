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

	if(typeof req.body.caption == 'undefined' ||
		typeof req.body.univ == 'undefined' ||
		typeof req.body.youtubeLinks == 'undefined' ||
		typeof req.body.studyContent == 'undefined') {
		res.json(common.getResponses('003', {}));
		return;
	}

	var dbFields = {		
		caption: req.body.caption,
		hashArray: common.getHashArray(req.body.caption),
		tagArray: common.getTagArray(req.body.caption),
		univ: req.body.univ,
		youtubeLinks: req.body.youtubeLinks,
		studyContent: req.body.studyContent,
		codeContent: req.body.codeContent ? req.body.codeContent : '',
		userId: req.accessUser._id,
		likes: []
	};

	var dbAction = function(actionData, cb){
		if(!req.body.postId){
			actionData.images = req.body.uploadedImage ? 
								req.body.uploadedImage : [];
			actionData.additionalFiles = req.body.uploadedFiles ? 
								req.body.uploadedFiles : [];
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
		uploadDir: 'post/',
		acceptAll: true
	}).array('images');
};

Post.prototype.beforeUpload = (req, res) => {
	var dbFieldImages = [];
	var additionalFiles = [];
	if(req.hasOwnProperty('files')) {
		if(req.files.length > 0) {
			req.files.forEach((file, k) => {
				if (fs.existsSync(file.path)){
					if(['image/png', 'image/jpg', 'image/jpeg'].indexOf(file.mimetype) > -1)
						dbFieldImages.push(file.filename);
					else
						additionalFiles.push({name: file.filename, displayName: file.originalname});
				}
			});
		}
	}
	res.json(common.getResponses('020', {
		images: dbFieldImages,
		additionalFiles: additionalFiles
	}));
}

Post.prototype.saveImages = function(req, res) {
	if(!req.hasOwnProperty('postId') ||
		!req.hasOwnProperty('onAfterUploadCallback')){
		res.json(common.getResponses('020', {}));
		return;
	}

	var dbFieldImages = [];
	var additionalFiles = [];
	if(req.hasOwnProperty('files')) {
		if(req.files.length > 0) {
			req.files.forEach((file, k) => {
				if (fs.existsSync(file.path)){
					if(['image/png', 'image/jpg', 'image/jpeg'].indexOf(file.mimetype) > -1)
						dbFieldImages.push(file.filename);
					else
						additionalFiles.push({name: file.filename, displayName: file.originalname});
				}
			});
		}
	}

	var callBack = (err, result) => {
		req.onAfterUploadCallback(req.postId);
	};
	var $wh = {_id: req.postId};
	var UPD = {images: [], additionalFiles: []};
	config.db.get('post', $wh, post => {
		if(post.length > 0){
			post = post[0];
			UPD.images = post.images.concat(dbFieldImages);
			UPD.additionalFiles = post.additionalFiles.concat(additionalFiles);
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
			if(UPD.images.length > 0 || UPD.additionalFiles.length > 0)
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

	if(!req.hasOwnProperty('accessUser')){
		res.json(common.getResponses('020', []));
		return;
	}


	var $this = new Post();
	var lookups = $this.getInitialLookups({user: true, comments: true});
	lookups.push({ $project : { "user.password": 0, "user.Verification_Mail" : 0 , "user.accessToken" : 0 } });
	var sortAsDesc = typeof req.query.sortAsDesc == 'undefined' ? -1 : 1;
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
	var matchAnd = [];

	if(req.body.searchText){
		var searchText = req.body.searchText;
		var $pattern = new RegExp(searchText, 'i');
		var matches = {
			$or: [
				{caption: {$regex: $pattern}},
				{univ: {$regex: $pattern}},
				{studyContent: {$regex: $pattern}},
				{codeContent: {$regex: $pattern}},
				{"user.name": {$regex: $pattern}},
				{"user.univ": {$regex: $pattern}}
			]
		};
		matchAnd.push({
			$or: [
				{
					$and: [
						{"user.isPrivate": 1},
						{
							$or: [
								{"user.userId": {$in: req.accessUser.followings}},
								{userId: req.accessUser._id}
							]
						},
						matches
					]
				},
				{
					$and: [
						{"user.isPrivate": {$ne: 1}},
						matches
					]
				}
			]
		});
	}

	else if(req.body.hashTag) {
		var hashTag = req.body.hashTag;
		if(/^#/ig.test(hashTag)) {
			var $pattern = new RegExp(hashTag, 'i');
			var univSearch = new RegExp(hashTag.replace(/^#/ig, '').replace(/_/ig, ' '), 'i');
			var matches = {
				$or: [
					{caption: {$regex: $pattern}},
					{"user.univ": {$regex: univSearch}}
				]
			};
			matchAnd.push({
				$or: [
					{
						$and: [
							{"user.isPrivate": 1},
							{
								$or: [
									{"user.userId": {$in: req.accessUser.followings}},
									{userId: req.accessUser._id}
								]
							},
							matches
						]
					},
					{
						$and: [
							{"user.isPrivate": {$ne: 1}},
							matches
						]
					}
				]
			});
		}
	}

	else if(req.body.atUser) {
		var atUser = req.body.atUser;
		matchAnd.push({
			$or: [
				{
					$and: [
						{"user.userId": atUser},
						{"user.isPrivate": 1},
						{
							$or: [
								{"user.userId": {$in: req.accessUser.followings}},
								{userId: req.accessUser._id}
							]
						}
					]
				},
				{
					$and: [
						{"user.userId": atUser},
						{"user.isPrivate": {$ne: 1}}
					]
				},
			]
		});
	}else{
		if(typeof req.accessUser.followings == 'object'){
			var publicProfileCritiria = [
				{"user.userId": {$in: req.accessUser.followings}},
				{hashArray : {$in: common.getHashTagFromFollowings(req.accessUser.followings)}}				
			];
			if(req.accessUser.univ)
				publicProfileCritiria.push({"user.univ": {$regex: new RegExp(req.accessUser.univ, 'i')}});
			matchAnd.push({
				$or: [
					{"user._id": req.accessUser._id},
					{
						$and: [
							{"user.isPrivate": 1},
							{"user.userId": {$in: req.accessUser.followings}}
						]
					},
					{
						$and: [
							{"user.isPrivate": {$ne: 1}},
							{
								$or: publicProfileCritiria
							}
						]
					}
				]
			});
		}
		else
			matchAnd.push({"user._id": req.accessUser._id});
	}

	lookups.push({ $match: {$and: matchAnd} });

	if(req.query.offset) {
		var lmt = typeof req.query.limit == 'undefined' ? 10 : req.query.limit;
		lmt = parseInt(req.query.offset) + lmt;
		lookups.push({ $limit: parseInt(lmt)});
		lookups.push({ $skip: parseInt(req.query.offset)});
	}

	config.db.customGetData('post', lookups,  (err, data) => {
		res.json(common.getResponses('020', data ? data : []));
	});

};


module.exports = Post;