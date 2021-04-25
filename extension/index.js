const WebSocket = require('ws');
const request = require('request');
'use strict';

module.exports = function (nodecg) {
	nodecg.Replicant('claim_id', { defaultValue: "Place claim id of your livestream here", persistent: true });
	nodecg.Replicant('defaultTrigger', { defaultValue: "Alert1" });
	nodecg.Replicant('triggers', { defaultValue: [{name: 'Alert1', amount: '', type: "greaterthan" }] });
	nodecg.Replicant('test', { defaultValue: 0, persistent: false });

	const claim_id = nodecg.Replicant('claim_id');
	const defaultTrigger = nodecg.Replicant('defaultTrigger');
	const triggers = nodecg.Replicant('triggers');
	const test = nodecg.Replicant('test');
	const socket = new WebSocket('wss://comments.lbry.com/api/v2/live-chat/subscribe?subscription_id=' + claim_id.value);
	const equals = [];

	function activateAlert(alertname, username, amount) {
		var myJSONObject = {"name": alertname, "message":"(" + username + ") tipped (" + amount + ") LBC"};
		request({
				url: 'http://localhost:9090/simple-alerts/alert',
				method: "POST",
				json: true,
				body: myJSONObject
		}, function (error, response, body){
				console.log("Done");
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
			var sorted = triggers.value;
			sorted.sort(function(a, b){return b.amount - a.amount});
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

	test.on('change', value => {
		var alertName = defaultTrigger.value;
		alertName = checkTriggers(value, alertName);
		activateAlert(alertName, "Slyver Testallone", value);
	});

	// Connection opened
	// Alojz helped with websockets code
	socket.addEventListener('open', function (event) {
			socket.send('Hello LBRY!');
	});

	// Listen for messages
	socket.addEventListener('message', function (event) {
		var comment=JSON.parse(event.data);
		console.log(comment.data.comment.comment);
		// If comment has support
		if(comment.data.comment.support_amount>0) {
			console.log("Has tip");
			var userName = comment.data.comment.channel_name;
			var alertName = defaultTrigger.value;
			var amount = comment.data.comment.support_amount

			alertName = checkTriggers(amount, alertName);
			activateAlert(alertName, userName, amount);
		}
	});

};
