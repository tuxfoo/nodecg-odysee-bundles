const WebSocket = require('ws');
const got = require('got');
const request = require('request');
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

	const equals = [];

	function activateAlert(alertname, username, amount) {
		var myJSONObject = {"name": alertname, "message":"(" + username + ") tipped (" + amount + ") LBC"};
		request({
				url: 'http://localhost:9090/simple-alerts/alert',
				method: "POST",
				json: true,
				body: myJSONObject
		}, function (error, response, body){
				console.log("Pushed Alert");
		});
	}

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
		if (socket.readyState === WebSocket.OPEN) {
			socket.close();
		}
	}

	function getClaimid() {
		var url = "https://chainquery.lbry.com/api/sql?query=SELECT%20*%20FROM%20claim%20WHERE%20publisher_id=%22" + claim_id.value + "%22%20AND%20bid_state%3C%3E%22Spent%22%20AND%20claim_type=1%20AND%20source_hash%20IS%20NULL%20ORDER%20BY%20id%20DESC%20LIMIT%201";
		var currentClaimid = (async () => {
			try {
					const response = await got(url, { json: true });
					if (response.body.data.length === 0) {
						nodecg.log.info("Array is empty, assuming claim id is for livestream.");
						reconnect(claim_id.value);
					} else {
						nodecg.log.info("Array should have claim id");
						nodecg.log.info(response.body.data[0].claim_id);
						reconnect(response.body.data[0].claim_id);
					}
			} catch (error) {
				nodecg.log.info("Failed to fetch claim id from publisher id, assuming claim id is for livestream.")
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
			// If comment has support
			if(comment.data.comment.support_amount>0) {
				console.log("Has tip");
				var userName = comment.data.comment.channel_name;
				var alertName = defaultTrigger.value;
				var amount = comment.data.comment.support_amount

				addToGoal(amount);
				addToTicker(userName, amount);
				alertName = checkTriggers(amount, alertName);
				activateAlert(alertName, userName, amount);
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
		activateAlert(alertName, "Slyver Testallone", value.amount);
	});

};
