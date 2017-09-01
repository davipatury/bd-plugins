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
				
			PluginHelper.ContextMenu.addOptionToMessageContextMenu({
				label: 'Quote',
				action: (props) => {
					self.quoteMessage(props.channel, props.message, self.shifted);
				}
			});
				
			PluginHelper.MessageButtons.addButtonToMessages({
				className: 'message-button btn-quote',
				tooltip: 'Quote',
				action: (props) => {
					self.quoteMessage(props.channel, props.message, self.shifted);
				},
				filter: ({thisObject}) => {
					let owner = thisObject._reactInternalInstance._currentElement._owner._instance;
					return !owner.props.fake
				}
			});
			
			PluginHelper.MessageButtons.addButtonToMessages({
				className: 'message-button btn-remove-quote',
				tooltip: 'Remove from quote',
				action: ({message}) => {
					if (self.quote) {
						self.removeFromQuote(message);
					}
				},
				filter: ({thisObject}) => {
					let owner = thisObject._reactInternalInstance._currentElement._owner._instance;
					return owner.props.fake
				}
			});
			
			$(document).on('keyup.pQuote keydown.pQuote', (e) => {
				self.shifted = e.shiftKey
			});
				
			this.patchSendMessageQuoted();
			this.patchSendEmptyMessages();
			this.injectCSS();
			
			this.Settings = new PluginHelper.Settings('PQuote');
			this.Settings.addCheckbox('Quote full message', 'quoteFullMessage', true);
			this.Settings.addCheckbox('Use animations', 'useAnimation', true);
		}
	}
	
	stop() {
		this.clearQuote(false);
		PQuote.cancelAllPatches();
		BdApi.clearCSS('PQuote');
		$(document).off('keyup.pQuote keydown.pQuote')
	}
	
	getSettingsPanel() {
		if(this.Settings) {
			return this.Settings.getSettingsPanel();
		}
		return "";
	}
	
	getName() {
		return "PQuote";
	}
	
	getDescription() {
		return "With this plugin you can quote someone else's message. This plugin requires PluginHelper.";
	}
	
	getVersion() {
		return "2.3";
	}
	
	getAuthor() {
		return "davipatury#5570";
	}
	
	static cancelAllPatches() {
		for (let cancel of PQuote.cancelPatches) {
			cancel();
		}
	}
	
	// Clear the quoting message
	clearQuote(useAnimation) {
		this.quote.messageGroup.messages.forEach((message) => {
			message.quoteDeleted = false;
		});
		this.quote = null;

		$(".quote-delete").off('click.pQuote');
		
		if (useAnimation) {
			$(".quote-msg").animate(
				{top: $('.quote-msg').height()},
				1000,
				() => {
					$(".quote-msg").remove();
				}
			);
		} else {
			$(".quote-msg").remove();
		}
	}
	
	// Remove a message line from a quote
	removeFromQuote(message) {
		if (this.quote) {
			let undeletedMessages = this.quote.messageGroup.messages.filter(lMessage => !lMessage.quoteDeleted);
			if (undeletedMessages.length <= 1) {
				this.clearQuote(this.Settings.getSetting('useAnimation'));
			} else {
				let messageIndex = this.quote.messageGroup.messages.indexOf(message);
				let deletedMessage = $($('.quote-msg .message')[messageIndex]);
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
	
	// Quote a message
	quoteMessage(channel, message, quoteAllMessage) {
		let useAnimation = this.Settings.getSetting('useAnimation');
		if (this.quote) {
			this.clearQuote(false);
			useAnimation = false;
		}

		this.quote = {
			channel: channel,
			message: message,
			messageGroup: $.extend(true, {}, this.getMessageGroup(message).props)
		};

		this.quote.messageGroup.fake = true;
		if (!this.Settings.getSetting('quoteFullMessage') && !quoteAllMessage) {
			this.quote.messageGroup.messages = [this.quote.message];
		}

		// Create quote message preview
		this.quotePreview(message, useAnimation);

		// Jump to quoted message
		MessageActions.jumpToMessage(channel.id, message.id);
	}

	maximizeOrMinimize(element) {
		if(this.quote) {
			let button = $(element);
			if(button.hasClass('quote-minimize')) {
				button
					.removeClass('quote-minimize')
					.addClass('quote-maximize');
				this.minimizeQuotePreview(this.Settings.getSetting('useAnimation'));
			} else {
				button
					.removeClass('quote-maximize')
					.addClass('quote-minimize');
				this.maximizeQuotePreview(this.Settings.getSetting('useAnimation'));
			}
		}
	}

	// Minimizes quote preview
	minimizeQuotePreview(useAnimation) {
		if(useAnimation) {
			$(".quote-msg").animate(
				{top: $('.quote-msg').height()-26},
				1000,
				() => {
	    			$('#message-group-quote').hide();
					$('.quote-msg').css('top', 0);
				}
			);
		} else {
			$('#message-group-quote').hide();
		}
	}

	// Maximizes quote preview
	maximizeQuotePreview(useAnimation) {
		if(useAnimation) {
			$('#message-group-quote').show();
			$('.quote-msg').css('top', $('.quote-msg').height()-26+'px');
			$(".quote-msg").animate(
				{top: 0},
				1000
			);
		} else {
			$('#message-group-quote').show();
		}
	}
	
	// Create quote message preview
	quotePreview(message, useAnimation) {
		$('form:has(.channel-text-area-default)').before(`<div class="quote-msg"></div>`);
		
		let self = this;
		
		// Create message preview
		let MessageGroup = WebpackModules.findByDisplayName("MessageGroup");
		ReactDOM.render(
			React.createElement(MessageGroup, this.quote.messageGroup, null),
			$(".quote-msg")[0],
			() => {
				$('.quote-msg').prepend(`
				<div class="quote-msg-titlebar">
					<a class="big-button quote-delete"></a>
					<a onclick="BdApi.getPlugin('PQuote').maximizeOrMinimize(this)" class="big-button quote-minimize"></a>
				</div>
				`)
				
				$('.quote-msg .btn-option').remove();
				$('.quote-msg .btn-reaction').remove();
				$('.quote-msg .message-group').attr("id", "message-group-quote");
				
				$(".quote-delete").on('click.pQuote', () => {
					self.clearQuote(self.Settings.getSetting('useAnimation'));
				});
				
				if(useAnimation) {
					$('.quote-msg')
						.css('top', $('.quote-msg').height()+'px')
						.show()
						.animate(
							{top: '0px'},
							1000
						);
				} else {
					$('.quote-msg').show();
				}
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
				return messageGroup;
			}
		}
		return null;
	}

	// Create Embed For Quoted Message
	createQuoteEmbed(message) {
		let quotedMessage = this.quote.message;
		let quotedChannel = this.quote.channel;
		let quotedMessageGroup = this.quote.messageGroup;
					
		let embed = {
			description: '',
			timestamp: quotedMessage.timestamp.toISOString(),
			color: quotedMessage.colorString && Number(quotedMessage.colorString.replace('#', '0x')),
			footer: {},
			fields: [],
			author: {
				name: quotedMessage.author.tag
			}
		}

		if(quotedMessage.author.avatar) {
			embed.author.icon_url = quotedMessage.author.getAvatarURL();
		} else {
			embed.author.icon_url = "https://discordapp.com/assets/0e291f67c9274a1abdddeb3fd919cbaa.png";
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
		
		quotedMessageGroup.messages.forEach((lMessage) => {
			if (!lMessage.quoteDeleted) {
				embed.description += `${lMessage.content}\n`;
				
				lMessage.attachments.forEach((attachment) => {
					if (attachment.width && !embed.image) {
						embed.image = attachment;
					}
				});
								
				lMessage.embeds.forEach((lEmbed) => {
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
	}

	// On Send Message
	patchSendMessageQuoted() {
		let self = this;
		const cancel = monkeyPatch(MessageActions, 'sendMessage', {
			before: ({methodArguments: [channel, message]}) => {
				if (self.quote) {
					self.createQuoteEmbed(message);
					self.clearQuote(self.Settings.getSetting('useAnimation'));
				}
			}
		});
		PQuote.cancelPatches.push(cancel);
	}
	
	// On Message Submitted
	patchSendEmptyMessages() {
		/*let self = this;
		const cancel = monkeyPatch(getOwnerInstance($('form')[0]), 'handleSendMessage', {
			instead: ({methodArguments: [e], originalMethod}) => {
				if (self.quote && 0 === e.length) {
					e = `${Math.round(+new Date()/1000)}`;
					monkeyPatch(MessageQueue, 'enqueue', {
						once: true,
						before: ({methodArguments: [action]}) => {
							if (action.type === 'send' && action.message.content == e) {
								action.message.content = "";
							}
						}
					});
				}
				originalMethod(e);
			}
		});
		PQuote.cancelPatches.push(cancel);*/
	}
	
	injectCSS() {
		BdApi.injectCSS('PQuote', `
			/* Quote button (next to reaction button) */
			.message-group .message-button {
				opacity: 0;
				-webkit-transition: opacity .2s ease;
				transition: opacity .2s ease;
				float: right;
				width: 16px;
				height: 16px;
				cursor: pointer;
				margin-right: 4px;
				top: 5px;
				right: 5px;
				position: relative;
				background-size: 16px 16px;
				background-image: var(--bg-image)
			}
			.message-group .message-button:hover {
				opacity: 1 !important;
			}
			.message-group .comment > div:hover .message-button, .message-group .system-message > div:hover .message-button {
				opacity: .4;
			}

			.message-group .message-button.btn-quote {
				--bg-image: url(data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjMDAwMDAwIiBoZWlnaHQ9IjI0IiB2aWV3Qm94PSIwIDAgMjQgMjQiIHdpZHRoPSIyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4gICAgPHBhdGggZD0iTTYgMTdoM2wyLTRWN0g1djZoM3ptOCAwaDNsMi00VjdoLTZ2NmgzeiIvPiAgICA8cGF0aCBkPSJNMCAwaDI0djI0SDB6IiBmaWxsPSJub25lIi8+PC9zdmc+);
			}
			.theme-dark .message-button.btn-quote {
				--bg-image: url(data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjRkZGRkZGIiBoZWlnaHQ9IjI0IiB2aWV3Qm94PSIwIDAgMjQgMjQiIHdpZHRoPSIyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4gICAgPHBhdGggZD0iTTYgMTdoM2wyLTRWN0g1djZoM3ptOCAwaDNsMi00VjdoLTZ2NmgzeiIvPiAgICA8cGF0aCBkPSJNMCAwaDI0djI0SDB6IiBmaWxsPSJub25lIi8+PC9zdmc+);
			}
			
			/* Remove quote button (remove 1 line from quote) */
			.message-group .message-button.btn-remove-quote {
				--bg-image: url(data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjMDAwMDAwIiBoZWlnaHQ9IjI0IiB2aWV3Qm94PSIwIDAgMjQgMjQiIHdpZHRoPSIyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4gICAgPHBhdGggZD0iTTAgMGgyNHYyNEgwVjB6IiBmaWxsPSJub25lIi8+ICAgIDxwYXRoIGQ9Ik02IDE5YzAgMS4xLjkgMiAyIDJoOGMxLjEgMCAyLS45IDItMlY3SDZ2MTJ6bTIuNDYtNy4xMmwxLjQxLTEuNDFMMTIgMTIuNTlsMi4xMi0yLjEyIDEuNDEgMS40MUwxMy40MSAxNGwyLjEyIDIuMTItMS40MSAxLjQxTDEyIDE1LjQxbC0yLjEyIDIuMTItMS40MS0xLjQxTDEwLjU5IDE0bC0yLjEzLTIuMTJ6TTE1LjUgNGwtMS0xaC01bC0xIDFINXYyaDE0VjR6Ii8+ICAgIDxwYXRoIGQ9Ik0wIDBoMjR2MjRIMHoiIGZpbGw9Im5vbmUiLz48L3N2Zz4=);
			}
			.theme-dark .message-button.btn-remove-quote {
				--bg-image: url(data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjRkZGRkZGIiBoZWlnaHQ9IjI0IiB2aWV3Qm94PSIwIDAgMjQgMjQiIHdpZHRoPSIyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4gICAgPHBhdGggZD0iTTAgMGgyNHYyNEgwVjB6IiBmaWxsPSJub25lIi8+ICAgIDxwYXRoIGQ9Ik02IDE5YzAgMS4xLjkgMiAyIDJoOGMxLjEgMCAyLS45IDItMlY3SDZ2MTJ6bTIuNDYtNy4xMmwxLjQxLTEuNDFMMTIgMTIuNTlsMi4xMi0yLjEyIDEuNDEgMS40MUwxMy40MSAxNGwyLjEyIDIuMTItMS40MSAxLjQxTDEyIDE1LjQxbC0yLjEyIDIuMTItMS40MS0xLjQxTDEwLjU5IDE0bC0yLjEzLTIuMTJ6TTE1LjUgNGwtMS0xaC01bC0xIDFINXYyaDE0VjR6Ii8+ICAgIDxwYXRoIGQ9Ik0wIDBoMjR2MjRIMHoiIGZpbGw9Im5vbmUiLz48L3N2Zz4=);
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

			/* Quoted message titlebar *?
			.quote-msg .quote-msg-titlebar {
				height: 8px;
			}
			

			/* Quote message titlebar button */
			.quote-msg .big-button {
				cursor: pointer;
				opacity: .4;
				width: 26px;
				height: 26px;
				float: right;
				background-size: 26px 26px;
				background-image: var(--bg-image)
			}
			.quote-msg .big-button:hover {
				opacity: 1 !important;
			}


			/* Undo quote button */
			.quote-msg .big-button.quote-delete {
				--bg-image: url(data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjMDAwMDAwIiBoZWlnaHQ9IjI0IiB2aWV3Qm94PSIwIDAgMjQgMjQiIHdpZHRoPSIyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4gICAgPHBhdGggZD0iTTE5IDYuNDFMMTcuNTkgNSAxMiAxMC41OSA2LjQxIDUgNSA2LjQxIDEwLjU5IDEyIDUgMTcuNTkgNi40MSAxOSAxMiAxMy40MSAxNy41OSAxOSAxOSAxNy41OSAxMy40MSAxMnoiLz4gICAgPHBhdGggZD0iTTAgMGgyNHYyNEgweiIgZmlsbD0ibm9uZSIvPjwvc3ZnPg==);
			}
			.theme-dark .quote-msg .big-button.quote-delete {
				--bg-image: url(data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjRkZGRkZGIiBoZWlnaHQ9IjI0IiB2aWV3Qm94PSIwIDAgMjQgMjQiIHdpZHRoPSIyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4gICAgPHBhdGggZD0iTTE5IDYuNDFMMTcuNTkgNSAxMiAxMC41OSA2LjQxIDUgNSA2LjQxIDEwLjU5IDEyIDUgMTcuNTkgNi40MSAxOSAxMiAxMy40MSAxNy41OSAxOSAxOSAxNy41OSAxMy40MSAxMnoiLz4gICAgPHBhdGggZD0iTTAgMGgyNHYyNEgweiIgZmlsbD0ibm9uZSIvPjwvc3ZnPg==);
			}

			/* Undo quote button */
			.quote-msg .big-button.quote-minimize {
				--bg-image: url(data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjMDAwMDAwIiBoZWlnaHQ9IjI0IiB2aWV3Qm94PSIwIDAgMjQgMjQiIHdpZHRoPSIyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4gICAgPHBhdGggZD0iTTcuNDEgNy44NEwxMiAxMi40Mmw0LjU5LTQuNThMMTggOS4yNWwtNiA2LTYtNnoiLz4gICAgPHBhdGggZD0iTTAtLjc1aDI0djI0SDB6IiBmaWxsPSJub25lIi8+PC9zdmc+);
			}
			.theme-dark .quote-msg .big-button.quote-minimize {
				--bg-image: url(data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjRkZGRkZGIiBoZWlnaHQ9IjI0IiB2aWV3Qm94PSIwIDAgMjQgMjQiIHdpZHRoPSIyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4gICAgPHBhdGggZD0iTTcuNDEgNy44NEwxMiAxMi40Mmw0LjU5LTQuNThMMTggOS4yNWwtNiA2LTYtNnoiLz4gICAgPHBhdGggZD0iTTAtLjc1aDI0djI0SDB6IiBmaWxsPSJub25lIi8+PC9zdmc+);
			}

			/* Undo quote button */
			.quote-msg .big-button.quote-maximize {
				--bg-image: url(data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjMDAwMDAwIiBoZWlnaHQ9IjI0IiB2aWV3Qm94PSIwIDAgMjQgMjQiIHdpZHRoPSIyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4gICAgPHBhdGggZD0iTTcuNDEgMTUuNDFMMTIgMTAuODNsNC41OSA0LjU4TDE4IDE0bC02LTYtNiA2eiIvPiAgICA8cGF0aCBkPSJNMCAwaDI0djI0SDB6IiBmaWxsPSJub25lIi8+PC9zdmc+);
			}
			.theme-dark .quote-msg .big-button.quote-maximize {
				--bg-image: url(data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjRkZGRkZGIiBoZWlnaHQ9IjI0IiB2aWV3Qm94PSIwIDAgMjQgMjQiIHdpZHRoPSIyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4gICAgPHBhdGggZD0iTTcuNDEgMTUuNDFMMTIgMTAuODNsNC41OSA0LjU4TDE4IDE0bC02LTYtNiA2eiIvPiAgICA8cGF0aCBkPSJNMCAwaDI0djI0SDB6IiBmaWxsPSJub25lIi8+PC9zdmc+);
			}
		`);
	}

}