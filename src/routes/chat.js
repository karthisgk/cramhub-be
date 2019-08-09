var common = require('../js/common.js');
var ObjectId = require('mongodb').ObjectId;
var config = require('../config/index.js');
var path = require('path');
const fs = require('fs');

function Chat() {
	var self = this;
	self.db = config.db;
	config.setSMTPConfig((smtp) => {
		this.smtp = smtp;
	});

    this.sendMessage = function(req, res){
        if(!req.hasOwnProperty('accessToken') || !req.hasOwnProperty('accessUser')){
    			res.json(common.getResponses('005', {}));
    			return;
    		}

        if(!req.body.message || (!req.body.sendTo && !req.body.conversationId)){
          res.json(common.getResponses('003', {}));
    			return;
        }

        var cid = '';
        if(req.body.conversationId)
          cid = req.body.conversationId;
        else{
          cid = common.getCrptoToken(8);
          var UPD = {$push: {chatConversations: cid}};
          self.db.customUpdate('user', {_id: {$in: [req.body.sendTo, req.accessUser._id]}}, UPD, (err, result) => {});
        }

        var dt = {
          conversationId: cid,
          senderId: req.accessUser._id,
          message: req.body.message
        };
        self.db.insert('chats', dt, (err, result) => {
            res.json(common.getResponses('020', {}));
        });
    }

    this.getMessages = function(req, res){

        if(!req.hasOwnProperty('accessToken') || !req.hasOwnProperty('accessUser')){
    			res.json(common.getResponses('005', {}));
    			return;
    		}

        if(!req.params.CID){
          res.json(common.getResponses('003', {}));
    			return;
        }

        var isAccess = false
        if(req.accessUser.chatConversations){
          isAccess = req.accessUser.chatConversations.indexOf(req.params.CID) >= 0;
        }

        if(isAccess) {
          self.db.get('chats', {conversationId: req.params.CID}, (data) => {
            res.json(common.getResponses('MNS020', data));
          });
        }else
          res.json(common.getResponses('MNS020', {}));
    }
};

module.exports = Chat;
