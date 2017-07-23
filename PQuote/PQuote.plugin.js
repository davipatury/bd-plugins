//META{"name":"PQuote"}*//

class PQuote {
	
	constructor() {
		this.quote = null;
		this.shifted = false;
		PQuote.cancelPatches = [];
	}
	
	load() {}
	unload() {}
	
	start() {
		if (PluginHelper) {
			PluginHelper.AutoUpdater.checkForUpdates({
				version: this.getVersion(),
				jsonUrl: 'https://raw.githubusercontent.com/davipatury/bd-plugins/master/PQuote/PQuote.json',
				pluginUrl: 'https://raw.githubusercontent.com/davipatury/bd-plugins/master/PQuote/PQuote.plugin.js',
				name: this.getName()
			});
			
			let self = this;
				
			PluginHelper.ContextMenu.addOptionToMessageContextMenu(
				'Quote',
				null,
				function(props) {
					self.quoteMessage(props, self.shifted);
				}
			);
				
			PluginHelper.MessageButtons.addButtonToMessages(
				'btn-quote',
				'Quote',
				function(props) {
					self.quoteMessage(props, self.shifted);
				},
				function(data) {
					let owner = data.thisObject._reactInternalInstance._currentElement._owner._instance;
					if (owner.props.fake) {
						return false;
					}
					return true;
				}
			);
			
			PluginHelper.MessageButtons.addButtonToMessages(
				'btn-remove-quote',
				'Remove from quote',
				function(props) {
					if (self.quote) {
						self.removeFromQuote(props);
					}
				},
				function(data) {
					let owner = data.thisObject._reactInternalInstance._currentElement._owner._instance;
					if (owner.props.fake) {
						return true;
					}
					return false;
				}
			);
			
			$(document).on('keyup.pQuote keydown.pQuote', function(e){
				self.shifted = e.shiftKey
			});
				
			this.patchSendMessageQuoted();
			this.injectCSS();
			
			if (bdPluginStorage.get('PQuote', 'quoteFullMessage') === undefined) {
				bdPluginStorage.set('PQuote', 'quoteFullMessage', true);
			}
		}
	}
	
	stop() {
		PQuote.cancelAllPatches();
		BdApi.clearCSS('PQuote');
		$(document).off('keyup.pQuote keydown.pQuote')
	}
	
	getSettingsPanel() {
		return "";
	}
	
	getName() {
		return "PQuote";
	}
	
	getDescription() {
		return "With this plugin you can quote someone else's message. This plugin requires PluginHelper.";
	}
	
	getVersion() {
		return "2.1";
	}
	
	getAuthor() {
		return "davipatury#5570";
	}
	
	static cancelAllPatches() {
		for (let cancel of PQuote.cancelPatches) {
			cancel();
		}
	}
	
	clearQuote() {
		this.quote.messageGroup.messages.forEach(function(message, i) {
			message.quoteDeleted = false;
		});
		this.quote = null;
		$(".quote-delete").off('click.pQuote');
		$(".quote-msg").animate(
			{top: $('.quote-msg').height()},
			1000,
			function() {
				$(".quote-msg").remove();
			}
		);
	}
	
	removeFromQuote(props) {
		if (this.quote) {
			let undeletedMessages = this.quote.messageGroup.messages.filter(message => !message.quoteDeleted);
			console.log(undeletedMessages)
			if (undeletedMessages.length <= 1) {
				this.clearQuote();
			} else {
				let messageIndex = this.quote.messageGroup.messages.indexOf(props.message);
				let deletedMessage = $($('#message-group-quote .comment .message')[messageIndex]);
				this.quote.messageGroup.messages[messageIndex].quoteDeleted = true;
				
				if (deletedMessage.hasClass('first')) {
					deletedMessage.removeClass('first');
					let username = deletedMessage.find('h2').clone();
					$($('.quote-msg .message')[messageIndex+1]).prepend(username).addClass('first');
				}
				deletedMessage.empty();
			}
		}
	}
	
	quoteMessage(props, quoteAllMessage) {
		if (this.quote) {
			this.clearQuote();
		}
		this.quote = props;
		this.cloneMessage(props, quoteAllMessage);
		MessageActions.jumpToMessage(props.channel.id, props.message.id);
	}
	
	cloneMessage(props, quoteAllMessage) {
		$('form:has(.channel-text-area-default)').before(`<div class="quote-msg"></div>`);
		
		let self = this,
			mg = this.getMessageGroup(props.message),
			messageGroup = mg.react.props;
		
		if (!bdPluginStorage.get('PQuote', 'quoteFullMessage') && !quoteAllMessage) {
			messageGroup.messages = [this.quote.message];
		}
		
		messageGroup.fake = true;
		messageGroup.realDomObject = mg.dom;
		this.quote.messageGroup = messageGroup;
		
		// Create message preview
		let MessageGroup = WebpackModules.findByDisplayName("MessageGroup");
		ReactDOM.render(
			React.createElement(MessageGroup, messageGroup, null),
			$(".quote-msg")[0],
			function() {
				$('.quote-msg').prepend(`
				<div class="quote-msg-titlebar">
					<a class="quote-delete"></a>
				</div>
				`)
				
				$('.quote-msg .btn-option').remove();
				$('.quote-msg .btn-reaction').remove();
				$('.quote-msg .message-group').attr("id", "message-group-quote");
				
				$(".quote-delete").on('click.pQuote', function() {
					self.clearQuote();
				});
				
				$('.quote-msg')
					.css('top', $('.quote-msg').height()+'px')
					.show()
					.animate(
						{top: '0px'},
						1000
					);
			}
		);
	}
	
	// Get a message's messageGroup
	getMessageGroup(message) {
		const $messageGroups = $('.message-group').toArray();
		for (let element of $messageGroups) {
			let messageGroup = getOwnerInstance(element, {include: ["MessageGroup"]});
			const messages = messageGroup.props.messages;
			if (messages.includes(message)) {
				return {
					dom: ReactDOM.findDOMNode(messageGroup),
					react: messageGroup
				};
			}
		}
		return null;
	}
	
	// On Send Message
	patchSendMessageQuoted() {
		let self = this;
		const cancel = monkeyPatch(MessageActions, 'sendMessage', {
			before: ({methodArguments: [channel, message]}) => {
				if (self.quote) {
					let quotedMessage = self.quote.message;
					let quotedChannel = self.quote.channel;
					let quotedMessageGroup = self.quote.messageGroup;
					
					let embed = {
						description: '',
						timestamp: quotedMessage.timestamp.toISOString(),
						color: quotedMessage.colorString && Number(quotedMessage.colorString.replace('#', '0x')),
						footer: {},
						fields: [],
						author: {
							name: quotedMessage.author.username + "#" + quotedMessage.author.discriminator,
							icon_url: PluginHelper.Constants.AVATAR_URL_TEMPLATE
								.replace("@user_id", quotedMessage.author.id)
								.replace("@avatar", quotedMessage.author.avatar)
						}
					}
					
					switch(quotedChannel.type) {
						case PluginHelper.Constants.ChannelType.GuildTextChannel:
							let footerText = "";
							if (PluginHelper.ChannelHelper.getCurrentChannelId() != quotedChannel.id) {
								footerText += `#${quotedChannel.name}`;
							}
							
							if (PluginHelper.GuildHelper.getCurrentGuildId() != quotedChannel.guild_id) {
								footerText += ` in ${PluginHelper.GuildHelper.getGuildById(quotedChannel.guild_id).name}`;
							}
							
							embed.footer.text = footerText;
							break;
						
						case PluginHelper.Constants.ChannelType.PrivateTextChannel:
							if (PluginHelper.ChannelHelper.getCurrentChannelId() != quotedChannel.id) {
								let user = PluginHelper.UserHelper.getUserById(quotedChannel.recipients[0]);
								embed.footer.text = `With ${user.username}#${user.discriminator}`;
							}
							
							break;
							
						case PluginHelper.Constants.ChannelType.DM: 
							if (PluginHelper.ChannelHelper.getCurrentChannelId() != quotedChannel.id) {
								embed.footer.text = `In DM ${quotedChannel.name}`;
							}
							
							break;
						
						default:
							embed.footer = null;
					}
					
					quotedMessageGroup.messages.forEach(function (message, i) {
						if (!message.quoteDeleted) {
							embed.description += `${message.content}\n`;
							
							message.attachments.forEach(function(attachment, i) {
								if (attachment.width && !embed.image) {
									embed.image = attachment;
								}
							});
								
							quotedMessage.embeds.forEach(function(lEmbed, i) {
								if (!embed.image && lEmbed.image) {
									embed.image = lEmbed.image;
								}
									
								if (!embed.thumbnail && lEmbed.thumbnail) {
									embed.thumbnail = lEmbed.thumbnail;
								}
									
								if (lEmbed.type == "video" && !embed.video) {
									embed.video = lEmbed.video;
								}
							});
						}
					});
					
					message.embed = embed;
					self.clearQuote();
				}
			}
		});
		PQuote.cancelPatches.push(cancel);
	}
	
	injectCSS() {
		BdApi.injectCSS('PQuote', `
			/* Quote button (next to reaction button) */
			.message-group .btn-quote {
				opacity: 0;
				-webkit-transition: opacity .2s ease;
				transition: opacity .2s ease;
				float: right;
				width: 16px;
				height: 16px;
				background-size: 16px 16px;
				cursor: pointer;
				background-image: url(data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjMDAwMDAwIiBoZWlnaHQ9IjI0IiB2aWV3Qm94PSIwIDAgMjQgMjQiIHdpZHRoPSIyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4gICAgPHBhdGggZD0iTTYgMTdoM2wyLTRWN0g1djZoM3ptOCAwaDNsMi00VjdoLTZ2NmgzeiIvPiAgICA8cGF0aCBkPSJNMCAwaDI0djI0SDB6IiBmaWxsPSJub25lIi8+PC9zdmc+);
				margin-right: 4px
			}
			.message-group .btn-quote:hover {
				opacity: 1 !important
			}
			.theme-dark .btn-quote {
				background-image: url(data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjRkZGRkZGIiBoZWlnaHQ9IjI0IiB2aWV3Qm94PSIwIDAgMjQgMjQiIHdpZHRoPSIyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4gICAgPHBhdGggZD0iTTYgMTdoM2wyLTRWN0g1djZoM3ptOCAwaDNsMi00VjdoLTZ2NmgzeiIvPiAgICA8cGF0aCBkPSJNMCAwaDI0djI0SDB6IiBmaWxsPSJub25lIi8+PC9zdmc+);
			}
			.message-group .comment > div:hover .btn-quote, .message-group .system-message > div:hover .btn-quote {
				opacity: .4
			}
			
			/* Remove quote button (remove 1 line from quote) */
			.message-group .btn-remove-quote {
				opacity: 0;
				-webkit-transition: opacity .2s ease;
				transition: opacity .2s ease;
				float: right;
				width: 16px;
				height: 16px;
				background-size: 16px 16px;
				cursor: pointer;
				background-image: url(data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjMDAwMDAwIiBoZWlnaHQ9IjI0IiB2aWV3Qm94PSIwIDAgMjQgMjQiIHdpZHRoPSIyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4gICAgPHBhdGggZD0iTTAgMGgyNHYyNEgwVjB6IiBmaWxsPSJub25lIi8+ICAgIDxwYXRoIGQ9Ik02IDE5YzAgMS4xLjkgMiAyIDJoOGMxLjEgMCAyLS45IDItMlY3SDZ2MTJ6bTIuNDYtNy4xMmwxLjQxLTEuNDFMMTIgMTIuNTlsMi4xMi0yLjEyIDEuNDEgMS40MUwxMy40MSAxNGwyLjEyIDIuMTItMS40MSAxLjQxTDEyIDE1LjQxbC0yLjEyIDIuMTItMS40MS0xLjQxTDEwLjU5IDE0bC0yLjEzLTIuMTJ6TTE1LjUgNGwtMS0xaC01bC0xIDFINXYyaDE0VjR6Ii8+ICAgIDxwYXRoIGQ9Ik0wIDBoMjR2MjRIMHoiIGZpbGw9Im5vbmUiLz48L3N2Zz4=);
				margin-right: 4px
			}
			.message-group .btn-remove-quote:hover {
				opacity: 1 !important
			}
			.theme-dark .btn-remove-quote {
				background-image: url(data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjRkZGRkZGIiBoZWlnaHQ9IjI0IiB2aWV3Qm94PSIwIDAgMjQgMjQiIHdpZHRoPSIyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4gICAgPHBhdGggZD0iTTAgMGgyNHYyNEgwVjB6IiBmaWxsPSJub25lIi8+ICAgIDxwYXRoIGQ9Ik02IDE5YzAgMS4xLjkgMiAyIDJoOGMxLjEgMCAyLS45IDItMlY3SDZ2MTJ6bTIuNDYtNy4xMmwxLjQxLTEuNDFMMTIgMTIuNTlsMi4xMi0yLjEyIDEuNDEgMS40MUwxMy40MSAxNGwyLjEyIDIuMTItMS40MSAxLjQxTDEyIDE1LjQxbC0yLjEyIDIuMTItMS40MS0xLjQxTDEwLjU5IDE0bC0yLjEzLTIuMTJ6TTE1LjUgNGwtMS0xaC01bC0xIDFINXYyaDE0VjR6Ii8+ICAgIDxwYXRoIGQ9Ik0wIDBoMjR2MjRIMHoiIGZpbGw9Im5vbmUiLz48L3N2Zz4=);
			}
			.message-group .comment > div:hover .btn-remove-quote, .message-group .system-message > div:hover .btn-remove-quote {
				opacity: .4
			}
			
			/* Quoted message group */
			#message-group-quote {
				margin-bottom: 10px !important;
				margin-top: 10px;
			}
			
			/* Quoted message container */
			.quote-msg {
				background-color: #212121;
				position: relative;
				display: none;
			}
			
			/* Undo quote button */
			.quote-msg .quote-delete {
				cursor: pointer;
				opacity: .4;
				width: 26px;
				height: 26px;
				float: right;
				background-size: 26px 26px;
				background-image: url(data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjMDAwMDAwIiBoZWlnaHQ9IjI0IiB2aWV3Qm94PSIwIDAgMjQgMjQiIHdpZHRoPSIyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4gICAgPHBhdGggZD0iTTE5IDYuNDFMMTcuNTkgNSAxMiAxMC41OSA2LjQxIDUgNSA2LjQxIDEwLjU5IDEyIDUgMTcuNTkgNi40MSAxOSAxMiAxMy40MSAxNy41OSAxOSAxOSAxNy41OSAxMy40MSAxMnoiLz4gICAgPHBhdGggZD0iTTAgMGgyNHYyNEgweiIgZmlsbD0ibm9uZSIvPjwvc3ZnPg==);
			}
			.quote-msg .quote-delete:hover {
				opacity: 1 !important
			}
			.theme-dark .quote-msg .quote-delete {
				background-image: url(data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjRkZGRkZGIiBoZWlnaHQ9IjI0IiB2aWV3Qm94PSIwIDAgMjQgMjQiIHdpZHRoPSIyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4gICAgPHBhdGggZD0iTTE5IDYuNDFMMTcuNTkgNSAxMiAxMC41OSA2LjQxIDUgNSA2LjQxIDEwLjU5IDEyIDUgMTcuNTkgNi40MSAxOSAxMiAxMy40MSAxNy41OSAxOSAxOSAxNy41OSAxMy40MSAxMnoiLz4gICAgPHBhdGggZD0iTTAgMGgyNHYyNEgweiIgZmlsbD0ibm9uZSIvPjwvc3ZnPg==);
			}
		`);
	}

}