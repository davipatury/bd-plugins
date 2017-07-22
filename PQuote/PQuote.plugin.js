//META{"name":"PQuote"}*//

class PQuote {
	
	constructor() {
		this.quote = null;
		PQuote.cancelPatches = [];
	}
	
	load() {}
	unload() {}
	
	start() {
		if(PluginHelper) {
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
					self.quoteMessage(props);
				}
			);
				
			PluginHelper.MessageButtons.addButtonToMessages(
				'btn-quote',
				'Quote',
				function(props) {
					self.quoteMessage(props);
				}
			);
				
			this.patchSendMessageQuoted();
			this.injectCSS();
			
			if(bdPluginStorage.get('PQuote', 'quoteFullMessage') == null) {
				bdPluginStorage.set('PQuote', 'quoteFullMessage', false);
			}
		}
	}
	
	stop() {
		PQuote.cancelAllPatches();
		BdApi.clearCSS('PQuote');
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
		return "2.0";
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
		this.quote = null;
		$(".quote-delete").off('click.pQuote');
		$(".quote-msg").remove();
	}
	
	quoteMessage(props) {
		if(this.quote) {
			this.clearQuote();
		}
		this.quote = props;
		this.cloneMessage(props);
		MessageActions.jumpToMessage(props.channel.id, props.message.id);
	}
	
	cloneMessage(props) {
		$('form:has(.channel-text-area-default)').before(`
		<div class="quote-msg">
			<div class="quote-msg-titlebar">
				<a class="quote-delete"></a>
			</div>
		</div>
		`);
		
		let mg = this.getMessageGroup(props.message);
		let messageGroup = $(mg).clone();
		
		let quotedMessage = $(".quote-msg");
		quotedMessage.show();
		messageGroup.appendTo(quotedMessage);

		if(!bdPluginStorage.get('PQuote', 'quoteFullMessage')) {
			let username = this.clearMessages(props.message, mg, messageGroup);
			if(username) {
				quotedMessage.find(".message").prepend(username);
			}
		} else {
			// TODO
		}
		
		quotedMessage.find(".btn-quote").remove();
		quotedMessage.find(".btn-reaction").remove();
		quotedMessage.find(".btn-option").remove();
		
		messageGroup.attr("id", "message-group-quote");
		
		let self = this;
		$(".quote-delete").on('click.pQuote', function() {
			self.clearQuote();
		});
	}
	
	getMessageGroup(message) {
		const $messageGroups = $('.message-group').toArray();
		for (let element of $messageGroups) {
			let messageGroup = getOwnerInstance(element, {include: ["MessageGroup"]});
			const messages = messageGroup.props.messages;
			if (messages.includes(message)) {
				return ReactDOM.findDOMNode(messageGroup);
			}
		}
		return null;
	}
	
	clearMessages(message, messageGroupOriginal, messageGroupClone) {
		let username;
		const messages = $(messageGroupOriginal).find('.message').toArray();
		const cloneMessages = $(messageGroupClone).find('.message').toArray();
		messages.forEach(function (element, i) {
			let lMessage = getOwnerInstance(element, {include: ["Message"]});
			if (lMessage.props.message != message) {
				let dMessage = $(cloneMessages[i]);
				if(dMessage.find('h2').length > 0) {
					username = dMessage.find('h2').clone();
				}
				dMessage.remove();
			}
		});
		return username;
	}
	
	patchSendMessageQuoted() {
		let self = this;
		const cancel = monkeyPatch(MessageActions, 'sendMessage', {
			before: ({methodArguments: [channel, message]}) => {
				if(self.quote) {
					let quotedMessage = self.quote.message;
					let quotedChannel = self.quote.channel;
					
					let embed = {
						description: quotedMessage.content,
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
					
					for (let attachment of quotedMessage.attachments) {
		                if (attachment.width) {
		                    embed.image = attachment;
		                }
					}
					
					if(quotedMessage.embeds.length > 0) {
						for (let lEmbed of quotedMessage.embeds) {
							if(!embed.image) {
								if (lEmbed.image) {
									embed.image = lEmbed.image;
								} else if (lEmbed.thumbnail) {
									embed.image = lEmbed.thumbnail;
								}
							}
							
							if(lEmbed.type == "video") {
								embed.video = lEmbed.video;
							}
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
					
					message.embed = embed;
					self.clearQuote();
				}
			}
		});
		PQuote.cancelPatches.push(cancel);
	}
	
	injectCSS() {
		BdApi.injectCSS('PQuote', `
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
			
			#message-group-quote {
				margin-bottom: 10px !important;
				margin-top: 10px;
			}
			
			
			.quote-msg {
				background-color: #212121;
			}
			
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