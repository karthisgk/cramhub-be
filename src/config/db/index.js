
const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');
const url = true ? 'mongodb://karthisgk:vijisgk97@localhost:27017'
: 'mongodb://karthisgk:vijisgk97@cramapi.karthisgk.be:27017';
const dbName = 'cramhub';

/*db.createUser(
   {
       user: "root", 
       pwd: "toor", 
       roles:["root"]
   })*/

function DB(){
	this.connect = function(cb){
		MongoClient.connect(url, function(err, client) {
		  	assert.equal(null, err);
		  	const db = client.db(dbName);
		  	cb(db);
		  	client.close();
		});
	};
}

DB.prototype.insert = function(tbName, data, cb) {
	this.connect(function(db){
		if(typeof data.length === "undefined"){
			db.collection(tbName).insertOne(data, function(err, r){
				if(err){
					assert.equal(null, err);
	      			assert.equal(2, r.insertedCount);
	      		}
      			cb(err, r);
			});
		}else{
			if(data.length <= 0){
				cb('Empty data', {});
				return;
			}
			db.collection(tbName).insertMany(data, function(err, r){
				if(err){
					assert.equal(null, err);
	      			assert.equal(2, r.insertedCount);
	      		}
      			cb(err, r);
			});
		}
	});
};

DB.prototype.update = function(tbName, wh, data, cb){
	this.connect(function(db){
		if(typeof data.length === "undefined"){
			db.collection(tbName).updateMany(wh, {$set: data}, function(err, r){
				if(err){
					assert.equal(null, err);
	      			assert.equal(1, r.matchedCount);
	      			assert.equal(1, r.modifiedCount);
	      		}
      			cb(err, r);
			});
		}
	});
};

DB.prototype.customUpdate = function(tbName, wh, data, cb){
	this.connect(function(db){
		if(typeof data.length === "undefined"){
			db.collection(tbName).updateMany(wh, data, function(err, r){
				if(err){
					assert.equal(null, err);
	      			assert.equal(1, r.matchedCount);
	      			assert.equal(1, r.modifiedCount);
	      		}
      			cb(err, r);
			});
		}
	});
};



DB.prototype.get =  function(tbName, wh, cb){
	this.connect(function(db){
		if(typeof wh.length === "undefined"){
			db.collection(tbName).find(wh).toArray((err, data) => {
				cb(data);
		  	});
		}
	});
};

DB.prototype.getCount =  function(tbName, wh, cb){
	this.connect(function(db){
		if(typeof wh.length === "undefined"){
			db.collection(tbName).find(wh).count(function (e, count) {
		      	return cb(count);
		    });
		}
	});
};

DB.prototype.customGetData = function(tbName, lookups, cb){
	this.connect(function(db){
		db.collection(tbName).aggregate(lookups, cb);
	});
};

module.exports = DB;
