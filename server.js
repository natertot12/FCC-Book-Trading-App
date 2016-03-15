// server.js

//eventually add a private messaging to this so after users trade they can send messages about when and where to meetup

// set up ======================================================================
var express  = require('express');
var app      = express();
var port     = process.env.PORT || 8080;
var mongoose = require('mongoose');
var passport = require('passport');
var flash    = require('connect-flash');

var morgan       = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser   = require('body-parser');
var session      = require('express-session');

var configDB = require('./config/database.js');

// configuration ===============================================================
mongoose.connect(configDB.url);
require('./config/passport')(passport);
app.use(morgan('dev'));
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.use(session({ secret: 'mysecret' }));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());


// requirements ================================================================
var mongo = require('mongodb').MongoClient;
var mongoUrl = 'mongodb://localhost:27017/books';
var request = require('request');
var path = require('path');
var fs = require('fs');
var User       = require('./app/models/user');
//var server = require('http').createServer(app);
//var io = require('socket.io').listen(server);
var errorMessage = "";
mongo.connect(mongoUrl, function(err, db) {
    if(err) throw err;
// normal posts  ===============================================================
    app.post('/addBook', function(req, res) {
        var query = req.body.title;
        var title = "";
        var imgLink = "";
        var author = "";
        request.get('https://www.googleapis.com/books/v1/volumes?q=' + query, function (error, response, body) {
            var data = JSON.parse(body);
            if(data.totalItems != 0) {
                title = data.items[0].volumeInfo.title;
                imgLink = data.items[0].volumeInfo.imageLinks.smallThumbnail;
                author = data.items[0].volumeInfo.authors[0];
                db.collection("books").insertOne({owner: req.user._id.toString(), title: title, imgLink: imgLink, author: author });
                console.log(req.user._id.toString());
            }
            res.redirect('/mybooks');
        });
    });
    
    app.post('/removeBook/:id', function(req, res) {
       var id = req.params.id;
       var ObjectID=require('mongodb').ObjectID;
       db.collection("books").remove({_id: ObjectID(id)});
       res.redirect('back');
    });
    
    app.post('/request/:id', function(req, res) {
       var id = req.params.id;
       var ObjectID = require('mongodb').ObjectID;
       if(req.user.local.state && req.user.local.city && req.user.local.name) {
           db.collection("books").findOne({_id: ObjectID(id)}, function(err, data) {
               if(err) throw err;
               if(data != null) {
                   console.log(req.user._id.toString());
                   console.log("author " + data.owner);
                    if(data.owner.toString() !== req.user._id.toString()) {
                        User.findOneAndUpdate({_id: req.user._id}, { $push: { yourReqs:  { user: data.owner  , bookID:id, owner: data.owner, title: data.title, author: data.author, imgLink: data.imgLink, userRequesting: req.user.local.name} } }, function(err, data) {if(err) throw err; /*console.log(data);*/} );//user requsting update
                        User.findOneAndUpdate({_id: data.owner  }, { $push: { theirReqs: { user: req.user._id, bookID:id, owner: data.owner, title: data.title, author: data.author, imgLink: data.imgLink, userRequesting: req.user.local.name} } }, function(err, data) {if(err) throw err; /*console.log(data);*/} ); //user recieving request
                    }
                    res.redirect('back');
               }
           });
       } else {
           errorMessage = '<div class="alert alert-danger text-center"><a class="close" onclick="$(&apos;.alert&apos;).hide()">&times;</a><p><strong>Error!</strong> Please update your profile completely</p></div>';
           res.redirect('back');
       }
    });
    
    app.post('/cancelRequest/:id', function(req, res) {
       var id = req.params.id;
       var ObjectID = require('mongodb').ObjectID;
       db.collection("books").findOne({_id: ObjectID(id)}, function(err, data) {
           if(err) throw err;
           if(data != null) {
               console.log(req.user._id.toString());
               console.log("author " + data.owner);
                //if(data.owner.toString() !== req.user._id.toString()) {
                    User.findOneAndUpdate({_id: req.user._id}, { $pull: { yourReqs:  { user: data.owner, bookID:id} } }, function(err, data) {if(err) throw err; console.log(data);} );//user requsting update
                    User.findOneAndUpdate({_id: data.owner  }, { $pull: { theirReqs: { user: req.user._id, bookID:id} } }, function(err, data) {if(err) throw err; console.log(data);} ); //user recieving request
                //}
                res.redirect('back');
           }
       });
    });
    
    app.post('/denyRequest/:id', function(req, res) {
       var id = req.params.id;
       var ObjectID = require('mongodb').ObjectID;
       db.collection("books").findOne({_id: ObjectID(id)}, function(err, data) {
           if(err) throw err;
           if(data != null) {
               console.log(req.user._id.toString());
               console.log("author " + data.owner);
                User.findOneAndUpdate({_id: req.user._id}, { $pull: { theirReqs:  { user: data.owner, bookID:id} } });
                User.findOneAndUpdate({_id: data.owner  }, { $pull: { yourReqs: { user: req.user._id, bookID:id} } });
                //send message that the other user denied
                res.redirect('back');
           }
       });
    });
    
    app.post('/acceptRequest/:id', function(req, res) {
        var id = req.params.id;
        var ObjectID = require('mongodb').ObjectID;
        db.collection("books").findOne({_id: ObjectID(id)}, function(err, data) {
            if(err) throw err;
            if(data != null) {
                console.log(req.user._id.toString());
                console.log("author " + data.owner);
                User.findOneAndUpdate({_id: req.user._id}, { $pull: { theirReqs:  { user: data.owner, bookID:id} } });
                User.findOneAndUpdate({_id: data.owner  }, { $pull: { yourReqs: { user: req.user._id, bookID:id} } });
                //send message that the other user confirmed
                res.redirect('back');
            }
        });
    });


// normal routes ===============================================================

    // show the home page (will also have our login links)
    app.get('/', function(req, res) {
        req.logout();
        res.render('index.ejs');
    });
    
    app.get('/books', isLoggedIn, function(req, res) {
        fs.readFile((path.join(__dirname + '/views/books.html')), function(err, result) {
        if (err) throw err;
            res.write(result);
            if(errorMessage) res.write(errorMessage);
            errorMessage = "";
            //db.collection("books").count({}, function (error, count) {
            db.collection("books").find({owner: { $ne: req.user._id.toString() } }).count({}, function (error, count) {
                if(error) throw error;
                if(count != 0) {
                    db.collection("books").find({owner: { $ne: req.user._id.toString() }}, function(err, data) {
                       if(err) throw err;
                       var a = 0; 
                       data.forEach(function(doc) {
                           User.findOne({_id: req.user._id.toString(), "yourReqs.bookID": {$ne: doc._id.toString()} }, function(err, data) {      //find if user already requested the book -> dont show book add a
                               if(err) throw err;
                               if(data != null) {
                                   res.write('<div class="col-sm-3 well"><p class="text-center">' + doc.title +'</p><img class="center-block text-center" src="' + doc.imgLink +'"/><p class="text-center">By: ' + doc.author + '</p><form method="post" action="/request/' + doc._id + '"><button type="submit" class="btn btn-secondary"><span class="glyphicon glyphicon-refresh"></span></button></form></div>');
                               } else res.write('<div class="col-sm-3 well"><p class="text-center">' + doc.title +'</p><img class="center-block text-center" src="' + doc.imgLink +'"/><p class="text-center">By: ' + doc.author + '</p><form method="post" action="/cancelRequest/' + doc._id + '"><button type="submit" class="btn btn-secondary"><span class="glyphicon glyphicon-remove"></span></button></form></div>');
                               
                               a++;
                                if(a == count) res.end();
                           });
                       });
                    });
                } else res.end();
            });
        });
    });
    app.get('/mybooks', isLoggedIn, function(req, res) {
        fs.readFile((path.join(__dirname + '/views/mybooks.html')), function(err, result) {
        if (err) throw err;
            res.write(result);
            db.collection("books").find({owner: req.user._id.toString()}).count({}, function (error, count) {
                if(error) throw error;
                if(count != 0) {
                    db.collection("books").find({owner: req.user._id.toString()}, function(err, data) {
                       if(err) throw err;
                       var a = 0; 
                       data.forEach(function(doc) {
                        a++;
                        res.write('<div class="col-sm-3 well"><form method="post" action="/removeBook/'+ doc._id + '"><input type="submit" id="removebtn" class="removebtn btn btn-danger" value="X"/></form><p class="text-center">' + doc.title +'</p><img class="center-block text-center" src="' + doc.imgLink +'"/><p class="text-center">By: ' + doc.author + '</p></div>');
                        if(a == count) res.end();
                       });
                    });
                } else res.end();
            });
        });
    });
    
    app.get('/update', isLoggedIn, function(req, res) {
        res.render('update.ejs', {
            user : req.user
        });
    });
    app.get('/profile', isLoggedIn, function(req, res) {
        res.render('profile.ejs', {
            user : req.user
        });
    });
    app.get('/logout', function(req, res) {
        req.logout();
        res.redirect('/');
    });
    
// =============================================================================
// AUTHENTICATE (FIRST LOGIN) ==================================================
// =============================================================================
        // LOGIN ===============================
        // show the login form
        app.get('/login', function(req, res) {
            res.render('login.ejs', { message: req.flash('loginMessage') });
        });
        // process the login form
        app.post('/login', passport.authenticate('local-login', {
            successRedirect : '/profile', // redirect to the secure profile section
            failureRedirect : '/login', // redirect back to the signup page if there is an error
            failureFlash : true // allow flash messages
        }));
        // SIGNUP =================================
        // show the signup form
        app.get('/signup', function(req, res) {
            res.render('signup.ejs', { message: req.flash('signupMessage') });
        });
        // process the signup form
        app.post('/signup', passport.authenticate('local-signup', {
            successRedirect : '/profile', // redirect to the secure profile section
            failureRedirect : '/signup', // redirect back to the signup page if there is an error
            failureFlash : true // allow flash messages
        }));
// =============================================================================
// AUTHORIZE (ALREADY LOGGED IN / CONNECTING OTHER SOCIAL ACCOUNT) =============
// =============================================================================
        app.get('/connect/local', function(req, res) {
            res.render('connect-local.ejs', { message: req.flash('loginMessage') });
        });
        app.post('/connect/local', passport.authenticate('local-signup', {
            successRedirect : '/profile', // redirect to the secure profile section
            failureRedirect : '/connect/local', // redirect back to the signup page if there is an error
            failureFlash : true // allow flash messages
        }));
// =============================================================================
// UNLINK ACCOUNTS =============================================================
// =============================================================================
    app.get('/unlink/local', isLoggedIn, function(req, res) {
        var user            = req.user;
        user.local.email    = undefined;
        user.local.password = undefined;
        user.local.state    = undefined;
        user.local.name     = undefined;
        user.local.city     = undefined;
        user.local.yourReqs = undefined;
        user.local.theirReqs= undefined;
        user.save(function(err) {
            if(err) throw err;
            res.redirect('/');
        });
    });
    
// =============================================================================
// UPDATE PROFILE ==============================================================
// =============================================================================

app.post('/update', function(req, res) {
    var user = req.user;
        user.local.name    = req.body.name;
        user.local.state   = req.body.state;
        user.local.city    = req.body.city;
    console.log("Updated user profile...");
    
     user.save(function(err) {
        if(err) throw err;
        res.redirect('/profile');
    });
});

// route middleware to ensure user is logged in
function isLoggedIn(req, res, next) {
    if (req.isAuthenticated())
        return next();

    res.redirect('/');
}



// launch ======================================================================
    app.listen(port);
    console.log('The magic happens on port ' + port);
});