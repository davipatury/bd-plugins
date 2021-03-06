//META{"name":"PluginHelper"}*//


// Discord Internals
// Credits: https://github.com/samogot/betterdiscord-plugins/blob/master/v1/1lib_discord_internals.plugin.js
PDiscordInternals = {};

PDiscordInternals.monkeyPatch = (what, methodName, options) => {
	const {before, after, instead, once = false, silent = false} = options;
	const displayName = options.displayName || what.displayName || what.name || what.constructor.displayName || what.constructor.name;
	if (!silent) console.log('patch', methodName, 'of', displayName);
	const origMethod = what[methodName];
	const cancel = () => {
		if (!silent) console.log('unpatch', methodName, 'of', displayName);
		what[methodName] = origMethod;
	};
	what[methodName] = function() {
		const data = {
			thisObject: this,
			methodArguments: arguments,
			cancelPatch: cancel,
			originalMethod: origMethod,
			callOriginalMethod: () => data.returnValue = data.originalMethod.apply(data.thisObject, data.methodArguments)
		};
		if (instead) {
			const tempRet = instead(data);
			if (tempRet !== undefined)
				data.returnValue = tempRet;
		}
		else {
			if (before) before(data);
			data.callOriginalMethod();
			if (after) after(data);
			}
		if (once) cancel();
		return data.returnValue;
	};
	what[methodName].__monkeyPatched = true;
	what[methodName].displayName = 'patched ' + (what[methodName].displayName || methodName);
	return cancel;
};

PDiscordInternals.WebpackModules = (() => {
	const req = webpackJsonp([], {
		'__extra_id__': (module, exports, req) => exports.default = req
	}, ['__extra_id__']).default;
	delete req.m['__extra_id__'];
	delete req.c['__extra_id__'];
	const find = (filter) => {
		for (let i in req.c) {
			if (req.c.hasOwnProperty(i)) {
				let m = req.c[i].exports;
				if (m && m.__esModule && m.default)
					m = m.default;
				if (m && filter(m))
					return m;
			}
		}
		console.warn('Cannot find loaded module in cache. Loading all modules may have unexpected side effects');
		for (let i = 0; i < req.m.length; ++i) {
			let m = req(i);
			if (m && m.__esModule && m.default)
				m = m.default;
			if (m && filter(m))
				return m;
		}
		console.warn('Cannot find module');
		return null;
	};
	
	const findByUniqueProperties = (propNames) => find(module => propNames.every(prop => module[prop] !== undefined));
	const findByDisplayName = (displayName) => find(module => module.displayName === displayName);
		
	return {find, findByUniqueProperties, findByDisplayName};
})();

PDiscordInternals.getInternalInstance = e => e[Object.keys(e).find(k => k.startsWith("__reactInternalInstance"))];

PDiscordInternals.getOwnerInstance = (e, {include, exclude=["Popout", "Tooltip", "Scroller", "BackgroundFlash"]} = {}) => {
	if (e === undefined)
		return undefined;
	const excluding = include === undefined;
	const filter = excluding ? exclude : include;
	function getDisplayName(owner) {
		const type = owner.type;
		return type.displayName || type.name || null;
	}
	function classFilter(owner) {
		const name = getDisplayName(owner);
		return (name !== null && !!(filter.includes(name) ^ excluding));
	}
	
	let internal = _.isNil(e.return)
	for (let curr = internal ? PDiscordInternals.getInternalInstance(e).return : e.return; !_.isNil(curr); curr = curr.return) {
		if (_.isNil(curr))
			continue;
		let owner = curr.stateNode;
		if (!_.isNil(owner) && !(owner instanceof HTMLElement) && classFilter(curr))
			return owner;
	}
			
	return null;
}

PDiscordInternals.Renderer = (() => {
	const recursiveArray = (parent, key, count = 1) => {
		let index = 0;
		
		function* innerCall(parent, key) {
			const item = parent[key];
			if (item instanceof Array) {
				for (const subKey of item.keys()) {
					yield* innerCall(item, subKey)
				}
			}
			else {
				yield {item, parent, key, index: index++, count};
			}
		}
		
		return innerCall(parent, key);
	};
		
	const recursiveArrayCount = (parent, key) => {
		let count = 0;
		for (let {} of recursiveArray(parent, key))
			++count;
		return recursiveArray(parent, key, count);
	};
		
	function* recursiveChildren(parent, key, index = 0, count = 1) {
		const item = parent[key];
		yield {item, parent, key, index, count};
		if (item && item.props && item.props.children) {
			for (let {parent, key, index, count} of recursiveArrayCount(item.props, 'children')) {
				yield* recursiveChildren(parent, key, index, count);
			}
		}
	}
		
	const reactRootInternalInstance = PDiscordInternals.getInternalInstance(document.getElementById('app-mount').firstElementChild);
		
	function* recursiveComponents(internalInstance = reactRootInternalInstance) {
		if (internalInstance._instance)
			yield internalInstance._instance;
		if (internalInstance._renderedComponent)
			yield* recursiveComponents(internalInstance._renderedComponent);
		if (internalInstance._renderedChildren)
			for (let child of Object.values(internalInstance._renderedChildren))
				yield* recursiveComponents(child);
	}
		
	const returnFirst = (iterator, process) => {
		for (let child of iterator) {
			const retVal = process(child);
			if (retVal !== undefined) {
				return retVal;
			}
		}
	};
		
	const getFirstChild = (rootParent, rootKey, selector) => {
		const getDirrectChild = (item, selector) => {
			if (item && item.props && item.props.children) {
				return returnFirst(recursiveArrayCount(item.props, 'children'), checkFilter.bind(null, selector));
			}
		};
		const checkFilter = (selector, {item, parent, key, count, index}) => {
			let match = true;
			if (match && selector.type)
				match = item && selector.type === item.type;
			if (match && selector.tag)
				match = item && typeof item.type === 'string' && selector.tag === item.type;
			if (match && selector.className) {
				match = item && item.props && typeof item.props.className === 'string';
				if (match) {
					const classes = item.props.className.split(' ');
					if (selector.className === true)
						match = !!classes[0];
					else if (typeof selector.className === 'string')
						match = classes.includes(selector.className);
					else if (selector.className instanceof RegExp)
						match = !!classes.find(cls => selector.className.test(cls));
					else match = false;
				}
			}
			if (match && selector.text) {
				if (selector.text === true)
					match = typeof item === 'string';
				else if (typeof selector.text === 'string')
					match = item === selector.text;
				else if (selector.text instanceof RegExp)
					match = typeof item === 'string' && selector.text.test(item);
				else match = false;
			}
			if (match && selector.nthChild)
				match = index === (selector.nthChild < 0 ? count + selector.nthChild : selector.nthChild);
			if (match && selector.hasChild)
				match = getDirrectChild(item, selector.hasChild);
			if (match && selector.hasSuccessor)
				match = item && !!getFirstChild(parent, key, selector.hasSuccessor).item;
			if (match && selector.eq) {
				--selector.eq;
				return;
			}
			if (match) {
				if (selector.child) {
					return getDirrectChild(item, selector.child);
				}
				else if (selector.successor) {
					return getFirstChild(parent, key, selector.successor);
				}
				else {
					return {item, parent, key};
				}
			}
		};
		return returnFirst(recursiveChildren(rootParent, rootKey), checkFilter.bind(null, selector)) || {};
	};
					
	const patchRender = (component, actions, filter) => {
		const cancel = PDiscordInternals.monkeyPatch(component.prototype, 'render', {
			after: (data) => {
				if (!filter || filter(data)) {
					for (let action of actions) {
						if (!action.filter || action.filter(data)) {
							const {item, parent, key} = getFirstChild(data, 'returnValue', action.selector);
							if (item) {
								const content = typeof action.content === 'function' ? action.content(data.thisObject, item) : action.content;
								switch (action.method) {
									case 'prepend':
										item.props.children = [content, item.props.children];
										break;
									case 'append':
										item.props.children = [item.props.children, content];
										break;
									case 'replaceChildren':
										item.props.children = content;
										break;
									case 'before':
										parent[key] = [content, parent[key]];
										break;
									case 'after':
										parent[key] = [parent[key], content];
										break;
									case 'replace':
										parent[key] = content;
										break;
									default:
										throw new Error('Unexpected method ' + action.method);
								}
							}
						}
					}
				}
			}
		});
		doOnEachComponent(component, c => c.forceUpdate());
		return () => {
			cancel();
			doOnEachComponent(component, c => c.forceUpdate());
		};
	};
		
		
	const planedActions = new Map();
	let planedPromise, planedPromiseResolver;
	const runPlannedActions = () => {
		for (let component of recursiveComponents()) {
			const actions = planedActions.get(component.constructor) || planedActions.get(component.constructor.displayName);
			if (actions) {
				for (let action of actions) {
					action(component);
				}
			}
		}
		planedPromiseResolver();
		planedActions.clear();
		planedPromise = null;
		planedPromiseResolver = null;
	};
		
	const doOnEachComponent = (componentType, action) => {
		if (planedActions.size === 0) {
			setImmediate(runPlannedActions);
			planedPromise = new Promise(resolve => planedPromiseResolver = resolve);
		}
		if (!planedActions.has(componentType))
			planedActions.set(componentType, []);
		planedActions.get(componentType).push(action);
		return planedPromise;
	};
		
	const rebindMethods = (component, methods) => {
		const rebind = function(thisObject) {
			for (let method of methods) {
				thisObject[method] = component.prototype[method].bind(thisObject)
			}
			thisObject.forceUpdate();
		};
		doOnEachComponent(component, rebind);
		let cancel;
		if (component.prototype.componentWillMount)
			cancel = PDiscordInternals.monkeyPatch(component.prototype, 'componentWillMount', {
				silent: true,
				after: ({thisObject}) => {
					rebind(thisObject);
				}
			});
		else {
			component.prototype.componentWillMount = function() {
				rebind(this);
			};
			cancel = () => delete component.prototype.componentWillMount;
		}
		return () => {
			cancel();
			doOnEachComponent(component, rebind);
		};
	};
		
	return {
		patchRender,
		recursiveArray,
		recursiveChildren,
		recursiveComponents,
		getFirstChild,
		doOnEachComponent,
		rebindMethods
	};
})();

PDiscordInternals.React = PDiscordInternals.WebpackModules.findByUniqueProperties(['createFactory']);

PDiscordInternals.ReactComponents = (() => {
	const components = {};
	const listners = {};
	const put = component => {
		const name = component.displayName;
		if (!components[name]) {
			components[name] = component;
			if (listners[name]) {
				listners[name].forEach(f => f(component));
				listners[name] = null;
			}
		}
	};
		
	const get = (name, callback = null) => new Promise(resolve => {
		const listner = component => {
			if (callback) callback(component);
			resolve(component);
		};
		if (components[name]) {
			listner(components[name]);
		}
		else {
			if (!listners[name]) listners[name] = [];
			listners[name].push(listner);
		}
	});
		
	const getAll = (...names) => Promise.all(names.map(name => get(name)));
		
	PDiscordInternals.monkeyPatch(PDiscordInternals.React, 'createElement', {
		displayName: 'React',
		before: ({methodArguments}) => {
			if (methodArguments[0].displayName) {
				put(methodArguments[0]);
			}
		}
	});
	for (let component of PDiscordInternals.Renderer.recursiveComponents()) {
		if (component.constructor.displayName) {
			put(component.constructor);
		}
	}
		
	return {get, getAll};
		
})();

//

const {monkeyPatch, WebpackModules, ReactComponents, getOwnerInstance, React, Renderer} = PDiscordInternals;

const ReactDOM = WebpackModules.findByUniqueProperties(['findDOMNode']);
	
const ChannelsStore = WebpackModules.findByUniqueProperties(['getChannel']);
const GuildsStore = WebpackModules.findByUniqueProperties(['getGuild']);
const UsersStore = WebpackModules.findByUniqueProperties(['getUser', 'getCurrentUser']);
const MembersStore = WebpackModules.findByUniqueProperties(['getNick']);

const MessageActions = WebpackModules.findByUniqueProperties(['jumpToMessage', '_sendMessage']);
const MessageQueue = WebpackModules.findByUniqueProperties(['enqueue']);
const MessageParser = WebpackModules.findByUniqueProperties(['createMessage', 'parse', 'unparse']);

const ContextMenuItemsGroup = WebpackModules.find(m => typeof m === "function" && m.length === 1 && m.toString().search(/className\s*:\s*["']item-group["']/) !== -1);
ContextMenuItemsGroup.displayName = 'ContextMenuItemsGroup';
const ContextMenuItem = WebpackModules.find(m => typeof m === "function" && m.length === 1 && m.toString().search(/\.label\b.*\.hint\b.*\.action\b/) !== -1);
ContextMenuItem.displayName = 'ContextMenuItem';

const ModalsStack = WebpackModules.findByUniqueProperties(['push', 'update', 'pop', 'popWithKey']);
ModalsStack.displayName = 'ModalsStack';
const ConfirmModal = WebpackModules.find(m => typeof m === "function" && m.length === 1 && m.prototype && m.prototype.handleCancel && m.prototype.handleSubmit && m.prototype.handleMinorConfirm);
ConfirmModal.displayName = 'ConfirmModal';
const TooltipWrapper = WebpackModules.find(m => m && m.prototype && m.prototype.showDelayed);
TooltipWrapper.displayName = 'TooltipWrapper';

class PluginHelper {
	
	constructor() {
		PluginHelper.cancelPatches = {
			allCancelPatches: [],
			specialCancelPatches: {}
		};
	}
	
	load() {}
	unload() {}
	
	start() {
		this.patchSendMessageWithEmbed();
		
		PluginHelper.AutoUpdater.checkForUpdates({
			version: this.getVersion(),
			jsonUrl: 'https://raw.githubusercontent.com/davipatury/bd-plugins/master/pluginHelper/pluginHelper.json',
			pluginUrl: 'https://raw.githubusercontent.com/davipatury/bd-plugins/master/pluginHelper/pluginHelper.plugin.js',
			name: this.getName()
		});
		
		this.Settings = new PluginHelper.Settings(this.getName())
							.createCategory("Autoupdater Configuration")
								.addCheckbox('Autoupdate', 'autoUpdate', true)
								.end()
	}
	
	stop() {
		PluginHelper.cancelAllPatches();
	}
	
	getSettingsPanel() {
		if(this.Settings) return this.Settings.getSettingsPanel();
		return "";
	}
	
	getName() {
		return "pluginHelper";
	}
	
	getDescription() {
		return "Plugin with helpers functions. Used to develop plugins.";
	}
	
	getVersion() {
		return "2.7";
	}
	
	getAuthor() {
		return "davipatury#5570";
	}
	
	static cancelAllPatches() {
		for (let cancel of PluginHelper.cancelPatches.allCancelPatches) {
			cancel();
		}
	}
	
	patchSendMessageWithEmbed() {
		const cancel = monkeyPatch(MessageActions, '_sendMessage', {
			before: ({methodArguments: [channel, message]}) => {
				if (message.embed) {
					monkeyPatch(MessageQueue, 'enqueue', {
						once: true,
						before: ({methodArguments: [action]}) => {
							if (action.type === 'send') {
								action.message.embed = message.embed;
							}
						}
					});
					monkeyPatch(MessageParser, 'createMessage', {
						once: true,
						after: ({returnValue}) => {
							if (returnValue) {
								returnValue.embeds.push(message.embed);
							}
						}
					});
				}
			}
		});
		PluginHelper.cancelPatches.allCancelPatches.push(cancel);
	}
	
}
PluginHelper.ContextMenu = class {
	
	/*
	{
		label: "Copy",
		hint: "Ctrl+C",
		action: () => {
			// bla
		},
		cancelId: "a"
	}
	*/
	static addOptionToMessageContextMenu(options) {
		this.addOptionToContextMenu('MessageContextMenu', options);
	}
		
	static addOptionToUserContextMenu(options) {
		this.addOptionToContextMenu('UserContextMenu', options);
	}
	
	static addOptionToChannelContextMenu(options) {
		this.addOptionToContextMenu('ChannelContextMenu', options);
	}
	
	static addOptionToGuildContextMenu(options) {
		this.addOptionToContextMenu('GuildContextMenu', options);
	}
	
	static addOptionToContextMenu(contextMenuId, options) {
		ReactComponents.get(contextMenuId, ContextMenu => {
			const cancel = Renderer.patchRender(ContextMenu, [
				{
					filter: options.filter,
					selector: {
						type: ContextMenuItemsGroup,
					},
					method: 'append',
					content: thisObject => React.createElement(ContextMenuItem, {
						label: typeof options.label === "function" ? options.label(thisObject.props) : options.label,
						hint: typeof options.hint === "function" ? options.hint(thisObject.props) : options.hint,
						action: options.action.bind(this, thisObject.props, thisObject)
					})
				}
			]);
			PluginHelper.cancelPatches.allCancelPatches.push(cancel);
			if(options.cancelId) {
				PluginHelper.cancelPatches.specialCancelPatches[options.cancelId] = cancel;
			}
		});
	}
		
}

PluginHelper.ChannelHelper = class {
	
	static parseChannel(channel) {
		if(channel.type != 2) {
			channel.sendMessage = function(content, embed) {
				let message = {
					content: content,
					channel_id: channel.id,
					isEmpty: 0 === content.length
				}

				if(embed) message.embed = embed;

				MessageActions.sendMessage(channel.id, message)
			}
		}
		
		return channel;
	}

	static getCurrentChannel() {
		return this.parseChannel(getOwnerInstance($('.chat')[0]).state.channel);
	}
	
	static getCurrentChannelId() {
		return this.getCurrentChannel().id;
	}
	
	static getChannelById(id) {
		return this.parseChannel(ChannelsStore.getChannel(id));
	}
	
	static getChannels() {
		return Object.values(ChannelsStore.getChannels()).map(channel => this.parseChannel(channel));
	}
}

PluginHelper.GuildHelper = class {
	
	static parseGuild(guild) {
		if(guild) {
			guild.getMemberById = function(id) {
				return PluginHelper.MemberHelper.getMember(guild.id, id);
			}
			
			guild.getMembers = function() {
				return PluginHelper.MemberHelper.getMembers(guild.id);
			}
			
			guild.getChannels = function() {
				return PluginHelper.ChannelHelper.getChannels().filter(channel => channel.guild_id == guild.id);
			}
			
			guild.getTextChannels = function() {
				return guild.getChannels().filter(channel => channel.type == 0);
			}
			
			guild.getVoiceChannels = function() {
				return guild.getChannels().filter(channel => channel.type == 2);
			}
		}
		
		return guild;
	}
	
	static getCurrentGuild() {
		return this.parseGuild(getOwnerInstance($('.chat')[0]).state.guild);
	}
	
	static getCurrentGuildId() {
		return this.getCurrentGuild() ? this.getCurrentGuild().id : null;
	}
	
	static getGuildById(id) {
		return this.parseGuild(GuildsStore.getGuild(id));
	}
	
	static getGuilds() {
		return Object.values(GuildsStore.getGuilds()).map(guild => this.parseGuild(guild));
	}
	
}

PluginHelper.MemberHelper = class {
	
	static getMember(guildId, memberId) {
		return MembersStore.getMember(guildId, memberId);
	}
	
	static getMembers(guildId) {
		return MembersStore.getMembers(guildId);
	}
	
}

PluginHelper.UserHelper = class {
	
	static getCurrentUser() {
		return UsersStore.getCurrentUser();
	}
	
	static getUserById(id) {
		return UsersStore.getUser(id);
	}
	
}

PluginHelper.Modals = class {
	
	static createConfirmModal(title, body) {
		ModalsStack.push(function(props) {
			return React.createElement(ConfirmModal, Object.assign({
				title: title,
				body: body,
			}, props));
		})
	}
		
}

PluginHelper.MessageButtons = class {
	
	/*
	{
		className: "class",
		tooltip: "bla",
		action: () => {
			// bla
		},
		filter: (props) => {
			return true
		},
		cancelId: "id"
	}
	*/
	static addButtonToMessages(options) {
		ReactComponents.get('Message', Message => {
			const cancel = Renderer.patchRender(Message, [
				{
					filter: options.filter,
					selector: {
						className: 'markup',
					},
					method: 'before',
					content: thisObject => React.createElement(TooltipWrapper, {text: options.tooltip}, React.createElement("div", {
						className: options.className,
						onClick: options.action.bind(this, thisObject.props, thisObject),
						onMouseDown: e => {
							e.preventDefault();
							e.stopPropagation();
						}
					}))
				}
			]);
			PluginHelper.cancelPatches.allCancelPatches.push(cancel);
			if(options.cancelId) {
				PluginHelper.cancelPatches.specialCancelPatches[options.cancelId] = cancel;
			}
		});
	}
	
	static removeButtonFromMessages(cancelId) {
		PluginHelper.cancelPatches.specialCancelPatches[cancelId]();
	}
	
}

PluginHelper.NotificationHelper = class {
	
	/*
	{
		title: "Title",
		body: "Body",
		icon: "Icon url",
		silent: false,
		id: "Notification id"
	}
	*/
	static sendNotification(options) {
		BdApi.getIpc().send(
			"NOTIFICATION_SHOW",
			options
		);
	}
	
	static closeNotification(id) {
		BdApi.getIpc().send("NOTIFICATION_CLOSE", id);
	}
	
	static onNotificationClick(notificationId, action) {
		BdApi.getIpc().addListener("NOTIFICATION_CLICK", action);
	}
	
	/*static offNotificationClick() {
		
	}*/
	
}

PluginHelper.AutoUpdater = class {
	
	static checkForUpdates(pluginInfo) {
		let autoUpdate = bdPluginStorage.get(pluginInfo.name, 'autoUpdate')
		autoUpdate = autoUpdate == null ? true : autoUpdate == "true" ? true : false
		require('https').get(pluginInfo.jsonUrl, function(res) {
			res.setEncoding('utf8');
			res.on('data', function(body) {
				let data = JSON.parse(body);
				if(pluginInfo.version != data.version && bdPluginStorage.get(pluginInfo.name, 'autoUpdate')) {
					PluginHelper.AutoUpdater.update(pluginInfo);
				}
			});
		});
	}
	
	static update(pluginInfo) {
		if(confirm(`There is an update for ${pluginInfo.name}.  Would you like to update now?`)) {
			let fs = require('fs'),
				file = fs.createWriteStream(`${PluginHelper.AutoUpdater.getPluginPath()}${pluginInfo.name}.plugin.js`);
			
			require('https').get(pluginInfo.pluginUrl, function(response) {
				response.pipe(file);
                
				file.on('finish', function() {
                    file.close();

                    alert(`${pluginInfo.name} plugin updated.  Press OK to reload discord`);
                    document.location.reload();
                });
			}).on('error', function(err) {
				console.log(`Error updating ${pluginInfo.name} plugin: ${err}`);
                alert(`Error updating ${pluginInfo.name} plugin:  ${err}`);
            });;
		}
	}
	
	static getPluginPath() {
		if (process.platform == "win32") {
			return process.env.APPDATA + "\\BetterDiscord\\plugins\\";
		} else if (process.platform == "linux"){
			return process.env.HOME + "/.config/BetterDiscord/plugins/";
		} else if (process.platform == "darwin"){
			return process.env.HOME + "/Library/Preferences/BetterDiscord/plugins/";
		}
	}
	
	static getThemePath() {
		if (process.platform == "win32") {
			return process.env.APPDATA + "\\BetterDiscord\\themes\\";
		} else if (process.platform == "linux"){
			return process.env.HOME + "/.config/BetterDiscord/themes/";
		} else if (process.platform == "darwin"){
			return process.env.HOME + "/Library/Preferences/BetterDiscord/themes/";
		}
	}
	
}

PluginHelper.Settings = class {
	
	constructor(pluginName) {
		this.pluginName = pluginName;
		this.categories = [];
	}
	
	getSetting(key) {
		let setting = bdPluginStorage.get(this.pluginName, key)
		
		if(setting == "true") return true
		if(setting == "false") return false
		
		return setting
	}
	
	static toggleCheckbox(e) {
		let elem = $(e)
		bdPluginStorage.set(elem.attr("data-pname"), elem.attr("data-skey"), elem.is(":checked").toString())
	}
	
	addCategory(category) {
		this.categories[this.categories.length] = category
		return category
	}
	
	createCategory(name) {
		let category = new PluginHelper.Settings.Category(this, name)
		this.categories[this.categories.length] = category
		return category
	}
	
	getSettingsPanel() {
		let returnValue = "<div style='margin-bottom: 20px;'>";
		
		this.categories.forEach(category => {
			returnValue += `
				<div>
					<div style="margin-bottom: 0px;">
						<span class="bda-name">${category.name}</span>
					</div>`
			
			category.checkboxes.forEach(checkbox => {
				let checkboxValue = bdPluginStorage.get(this.pluginName, checkbox.settingsKey) == "true" ? 'checked="on"' : '';
				returnValue += `
					<div style="margin-top: 10px;">
						<div class="bda-left">
							<div class="scroller-wrap fade">
								<div class="scroller">${checkbox.text}</div>
							</div>
						</div>
						<div class="bda-right">
							<label class="ui-switch-wrapper ui-flex-child" style="flex: 0 0 auto; margin-top: 0px;">
								<input type="checkbox" class="ui-switch-checkbox" data-skey="${checkbox.settingsKey}" data-pname="${this.pluginName}" onchange="PluginHelper.Settings.toggleCheckbox(this)" ${checkboxValue}>
								<div class="ui-switch"></div>
							</label>
						</div>
					</div>`
			});
			
			returnValue += "</div>"
		});
		
		returnValue += "</div>";
		return returnValue;
	}
	
}

PluginHelper.Settings.Category = class {
	
	constructor(settings, name) {
		this.settings = settings;
		this.name = name;
		this.checkboxes = [];
	}
	
	addCheckbox(text, settingsKey, defaultValue) {
		if(bdPluginStorage.get(this.settings.pluginName, settingsKey) == null && defaultValue) {
			bdPluginStorage.set(this.settings.pluginName, settingsKey, defaultValue ? defaultValue.toString() : defaultValue);
		}
		
		this.checkboxes[this.checkboxes.length] = {
			text: text,
			settingsKey: settingsKey
		}
		
		return this;
	}
	
	end() {
		return this.settings;
	}
	
}

PluginHelper.Constants = {
	
	AVATAR_URL_TEMPLATE: "https://cdn.discordapp.com/avatars/@user_id/@avatar.webp",
	
	ChannelType: {
		GuildTextChannel: 0,
		PrivateTextChannel: 1,
		VoiceChannel: 2,
		DM: 3
	}
	
}