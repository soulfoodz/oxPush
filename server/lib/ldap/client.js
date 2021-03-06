/**
 * Provides base operations with LDAP server.
 *
 * Author: Yuriy Movchan Date: 11/07/2013
 */

var ldap = require('ldapjs');
var Logger = require('bunyan');
var util = require('util');

var MAX_CONNS = process.env.LDAP_MAX_CONNS || 10;
var SERVER_URL = process.env.LDAP_SERVER_URL || 'ldap://localhost:1389';
var BIND_DN = process.env.LDAP_BIND_DN || 'cn=directory manager';
var BIND_CREDENTIALS = process.env.LDAP_BIND_CREDENTIALS || 'password';
var LOG_LEVEL = process.env.LDAP_LOG_LEVEL || 'debug';

var LOG = new Logger({
	name : 'ldapjs',
	streams : [ {
		level : 'info',
		stream : process.stdout, // Log INFO and above to console
	}, {
		level : LOG_LEVEL,
		type : 'rotating-file',
		period : '1d', // daily rotation
		count : 5, // keep 5 back copies
		path : './log/oxpushserver-error.log' // Log specified level and above to file
	} ],

	serializers : Logger.stdSerializers
});

function LdapClient(baseDn) {
	this.baseDn = baseDn;

	this.client = ldap.createClient({
		url : SERVER_URL,
		maxConnections : MAX_CONNS,
		bindDN : BIND_DN,
		bindCredentials : BIND_CREDENTIALS,
		log : LOG
	});
}

module.exports = LdapClient;

LdapClient.prototype.add = function add(dn, entry, callback) {
	if (typeof (callback) !== 'function') {
		throw new TypeError('Callback (function) required');
	}

	this.client.add(dn, entry, function(err) {
		if (err) {
			LOG.error(err, "Failed to add: '%s', entry: '%s'", dn, entry);
			callback(false);
		} else {
			callback(true);
		}
	});
};

LdapClient.prototype.modify = function modify(dn, operation, modification, callback) {
	if (typeof (callback) !== 'function') {
		throw new TypeError('Callback (function) required');
	}

	var change = new ldap.Change({
		operation : operation,
		modification : modification
	});

	this.client.modify(dn, change, function(err, res) {
		if (err) {
			LOG.error(err, "Failed to modify entry: '%s', change: '%s'", dn, change);
			callback(false);
		} else {
			callback(true);
		}
	});
};

LdapClient.prototype.search = function search(base, filter, attributes, scope, sizeLimit, callback) {
	if (typeof (sizeLimit) === 'function') {
		callback = sizeLimit;
		sizeLimit = 0;
	}

	if (typeof (callback) !== 'function') {
		throw new TypeError('Callback (function) required');
	}

	var options = {
		filter : filter,
		scope : scope,
		attributes : attributes,
		sizeLimit : sizeLimit
	};

	var entries = [];
	this.client.search(base, options, function(err, res) {
		if (err) {
			LOG.error(err, "Failed to find entry using base: '%s', options: '%s'", base, options);
			callback(null);
		} else {

			res.on('searchEntry', function(entry) {
				entries.push(entry.object);
			});

			res.on('end', function(result) {
				callback(entries);
			});

			res.on('error', function(err) {
				LOG.error(err, "Failed to find entry using base: '%s', options: '%s'", base, options);
				callback(null);
			});
		}
	});
};

LdapClient.prototype.get = function get(dn, callback) {
	this.search(dn, 'objectClass=*', [], 'base', 0, function(entries) {
		if (entries) {
			if (entries.length == 1) {
				callback(entries[0]);
			} else {
				if (entries.length > 1) {
					LOG.error(err, "Found more than one entry by DN: '%s'", dn);
				}
				callback(null);
			}
		} else {
			callback(null);
		}
	});
};

LdapClient.prototype.contains = function contains(dn, callback) {
	this.search(dn, 'objectClass=*', [], 'base', 1, function(entries) {
		if (entries) {
			var result = entries.length == 1;
			callback(result);
		} else {
			callback(false);
		}
	});
};

LdapClient.prototype.compare = function compare(dn, attribute, value, callback) {
	if (typeof (callback) !== 'function') {
		throw new TypeError('Callback (function) required');
	}

	this.client.compare(dn, attribute, value, function(err, matched) {
		if (err) {
			LOG.error(err, "Failed to comapre: '%s', attribute: '%s', value: '%s'", dn, attribute, value);
			callback(false);
		} else {
			callback(matched);
		}
	});
};

LdapClient.prototype.del = function del(dn, callback) {
	if (typeof (callback) !== 'function') {
		throw new TypeError('Callback (function) required');
	}

	this.client.del(dn, function(err) {
		if (err) {
			LOG.error(err, "Failed to del: '%s'", dn);
			callback(false);
		} else {
			callback(true);
		}
	});
};

LdapClient.prototype.shutdown = function shutdown(callback) {
	this.client.unbind(callback);
};

LdapClient.prototype.getDn = function getDn(subDn, rdn) {
	if (subDn) {
		if (rdn) {
			return util.format("%s,%s,%s", rdn, subDn, this.baseDn);
		} else {
			return util.format("%s,%s", subDn, this.baseDn);
		}
	} else {
		if (rdn) {
			return util.format("%s,%s", rdn, this.baseDn);
		} else {
			return this.baseDn;
		}
	}
};
