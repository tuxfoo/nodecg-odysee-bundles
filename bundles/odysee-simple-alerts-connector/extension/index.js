const WebSocket = require('ws');
const request = require('request');
const got = require('got');
'use strict';

module.exports = function (nodecg) {
	nodecg.Replicant('claim_id', { defaultValue: "Place claim id of your livestream here", persistent: true });
	nodecg.Replicant('defaultTrigger', { defaultValue: "Alert1" });
	nodecg.Replicant('triggers', { defaultValue: [{name: 'Alert1', amount: '', type: "greaterthan" }] });
	nodecg.Replicant('test', { defaultValue: { amount: 0, change: 0 }, persistent: false });


	const claim_id = nodecg.Replicant('claim_id');
	let socket = new WebSocket('wss://comments.lbry.com/api/v2/live-chat/subscribe?subscription_id=' + claim_id.value);
	const defaultTrigger = nodecg.Replicant('defaultTrigger');
	const triggers = nodecg.Replicant('triggers');
	const test = nodecg.Replicant('test');
	// Fail safe for disconnections
	const reload = setInterval(isOpen, 300000);
	const equals = [];

// simple-alerts Rest API Request to add on alert to queue
	function activateAlert(alertname, username, amount, attach) {
		if (attach != "") {
			var myJSONObject = {"name": alertname, "message":"(" + username + ") tipped (" + amount + ") LBC", "attachMsg": attach};
		} else {
			var myJSONObject = {"name": alertname, "message":"(" + username + ") tipped (" + amount + ") LBC"};
		}
		request({
				url: 'http://localhost:9090/simple-alerts/alert',
				method: "POST",
				json: true,
				body: myJSONObject
		}, function (error, response, body){
				console.log("Pushed Alert");
		});
	}

// simple-chat rest API request to send chat message.
	function sendToLog(username, message, extra) {
		var myJSONObject = {"name": username, "message": message, "extra": extra};
		request({
				url: 'http://localhost:9090/simple-chat/log',
				method: "POST",
				json: true,
				body: myJSONObject
		}, function (error, response, body){
				console.log("Pushed to Log");
		});
	}

// simple-chat rest API request to add a chat message to history (so chat can be preloaded)
	function addhistory(username, message, extra) {
		var myJSONObject = {"name": username, "message": message, "extra": extra};
		request({
				url: 'http://localhost:9090/simple-chat/history',
				method: "POST",
				json: true,
				body: myJSONObject
		}, function (error, response, body){
				console.log("Pushed to history");
		});
	}

// simple-donation-ticker Rest API request to add a message to ticker.
	function addToTicker(username, amount) {
		var myJSONObject = {"name": username, "amount": amount};
		request({
				url: 'http://localhost:9090/simple-donation-ticker/ticker',
				method: "POST",
				json: true,
				body: myJSONObject
		}, function (error, response, body){
				console.log("Pushed to ticker");
		});
	}
// simple-goals Rest API request to add value to goal
	function addToGoal(amount) {
		var myJSONObject = {"amount": amount};
		request({
				url: 'http://localhost:9090/simple-goals/goal',
				method: "POST",
				json: true,
				body: myJSONObject
		}, function (error, response, body){
				console.log("Pushed to goal");
		});
	}

// check alert triggers
	function checkTriggers(amount, alertName) {
		equals.forEach(isEquals);
		// Check if alert is equal too a trigger
		function isEquals(value, index, array) {
			if ( value.amount == amount ) {
				alertName = value.name;
			}
		}
		if ( alertName == defaultTrigger.value ) {
			// Check greater than starting from largest number.
			var sorted = [...triggers.value];
			sorted.sort( function (a, b) { return b.amount - a.amount } );
			for (const value of sorted) {
				if ( value.type != "equals" && parseFloat(amount) >= parseFloat(value.amount) ) {
					alertName = value.name;
					break;
				}
			}
		}
		return (alertName);
	}

	function hasAttach(alert) {
		var attach = false;
		for (const value of triggers.value) {
			if (value.name == alert) {
				if (typeof value.attach != 'undefined') {
					if (value.attach == true) {
						attach = true;
						break;
					}
				}
			}
		}
		return attach;
	}

	function preloadChat(claimid) {
		var url = 'https://comments.lbry.com/api'
		// Get comment history
		var myJSONObject = `{
			"jsonrpc": "2.0",
			"id": "null",
			"method": "get_claim_comments",
			"params": {
				"claim_id": "` + claimid + `",
				"page_size": 5,
				"is_channel_signature_valid": true,
				"visible": true
			}
		}`;
		const response = got(
			url,
			{
				timeout: 1000, retry: 1,
				headers: {'Content-Type': 'application/json' },
				body: myJSONObject, json: true
			}
		).then(res => {
			nodecg.log.info("Preloading Comments");
			(async function() {
				try {
						for (var i = 0, j = res.body.result.items.length - 1; i < res.body.result.items.length; i++, j--) {
							if (await addComment(res.body.result.items[j]) == false) {
								nodecg.log.info("Skipping comment preload");
								break;
							}
						}
					} catch {
						nodecg.log.info("There does not appear to be any previous comments to load. Skipping...");
					}
				})();
		}).catch(err => {
			nodecg.log.info("Timed out, not adding past message. LBRY API server might be down.");
		});
	}

	//get channel/username from comment id.
	async function addComment(value) {
		var url = 'https://comments.lbry.com/api';
		var myJSONObject = `{
			"jsonrpc": "2.0",
			"id": "null",
			"method": "get_channel_from_comment_id",
			"params": {
				"comment_id": "` + value.comment_id + `"
			}
		}`;
		var username = "";
		var success = true;
		const response = await got.post(
			url,
			{
				timeout: 1000, retry: 1,
				headers: {'Content-Type': 'application/json' },
				body: myJSONObject, json: true
			}
		).then(res => {
			username = res.body.result.channel_name;
			var comment = value.comment;
			if (value.support_amount > 0) {
				var extra = { class: "tipmsg", message: "Tipped " + value.support_amount + " LBC"};
			} else {
				var extra = { class: "message-wrap", message: ""};
			}
			addhistory(username, comment, extra);
			nodecg.log.info(username + ":" + comment);
		}).catch(err => {
			success = false;
			nodecg.log.info("Timed out, not adding past message. LBRY API server might be down.");
		});
		return success;
	}

	triggers.on('change', value => {
		equals.splice(0, equals.length);
		triggers.value.forEach(sortEquals);
		function sortEquals(value, index, array) {
			if ( value.type == "equals" ) {
				// Add message to Queue
				equals.push(value);
			}
		}
	});

	claim_id.on('change', value => {
		nodecg.log.info("Trying to connect to odysee");
		if (socket.readyState === WebSocket.OPEN) {
			socket.close();
		} else {
			getClaimid();
		}
	});

	function isOpen() {
		if (socket.readyState != WebSocket.OPEN) {
			socket.close();
			nodecg.log.info("Timed out, Reconnecting....");
			getClaimid();
		}
	}

	function getClaimid() {
		var url = "https://chainquery.lbry.com/api/sql?query=SELECT%20*%20FROM%20claim%20WHERE%20publisher_id=%22" + claim_id.value + "%22%20AND%20bid_state%3C%3E%22Spent%22%20AND%20claim_type=1%20AND%20source_hash%20IS%20NULL%20ORDER%20BY%20id%20DESC%20LIMIT%201";
		var currentClaimid = (async () => {
			try {
					const response = await got(url, { json: true, timeout: 2000, retry: 1 });
					if (response.body.data.length === 0) {
						nodecg.log.info("Array is empty, assuming claim id is for livestream.");
						//preloadChat(claim_id.value);
						reconnect(claim_id.value);
					} else {
						nodecg.log.info("Array should have claim id");
						nodecg.log.info(response.body.data[0].claim_id);
						//preloadChat(response.body.data[0].claim_id);
						reconnect(response.body.data[0].claim_id);
					}
			} catch (error) {
				nodecg.log.info("Failed to fetch claim id from publisher id, assuming claim id is for livestream.")
				//preloadChat(claim_id.value);
				reconnect(claim_id.value);
			}
		})();
	}

	function reconnect(claimid) {
		nodecg.log.info("Connecting using " + claimid);
		socket = new WebSocket('wss://comments.lbry.com/api/v2/live-chat/subscribe?subscription_id=' + claimid);
		// Connection opened
		// Alojz helped with websockets code
		socket.addEventListener('open', function (event) {
				socket.send('Hello LBRY!');
		});
		// Listen for messages
		socket.addEventListener('message', function (event) {
			var comment=JSON.parse(event.data);
			nodecg.log.info(comment.data.comment.comment);

			var userName = comment.data.comment.channel_name;
			var alertName = defaultTrigger.value;
			var amount = comment.data.comment.support_amount;
			var msg = comment.data.comment.comment;

			// If comment has support
			if(comment.data.comment.support_amount>0) {
				console.log("Has tip");
				addToGoal(amount);
				addToTicker(userName, amount);
				alertName = checkTriggers(amount, alertName);
				// Add if else to see if alert has attach enabled.
				if (hasAttach(alertName) == true) {
					activateAlert(alertName, userName, amount, msg);
				} else {
					activateAlert(alertName, userName, amount, "");
				}
				sendToLog(userName, msg, {class: "tipmsg", message: "Tipped " + amount + " LBC"});
				addhistory(userName, msg, {class: "tipmsg", message: "Tipped " + amount + " LBC"});
			} else {
				sendToLog(userName, msg, {class: "message-wrap", message: ""});
				addhistory(userName, msg, {class: "message-wrap", message: ""});
			}
		});

		socket.addEventListener('close', function (event) {
			nodecg.log.info("Lost Connection; Will attempt to reconnect shortly....");
			setTimeout(function() {
					getClaimid();
			}, 5000);
		});

		socket.addEventListener('error', function (event) {
			nodecg.log.info("Error, cannot connect to Odysee.");
      socket.close();
		});
	}

	test.on('change', value => {
		var alertName = defaultTrigger.value;
		alertName = checkTriggers(value.amount, alertName);
		if (hasAttach(alertName) == true) {
			nodecg.log.info("has attached message.")
			activateAlert(alertName, "Slyver Testallone", value.amount, "Hello World, Is that a Bird, or a plane? No, its just Bob.");
		} else {
			activateAlert(alertName, "Slyver Testallone", value.amount, "");
		}
	});

};
