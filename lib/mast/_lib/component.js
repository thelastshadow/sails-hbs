// Components are the smallest unit of event handling and logic
// Components may contain sub-components, but (as of may 12th 2012),
// they are responsible for calling render on those elements
Mast.Component = 
{
		
	initialize: function(attributes,options,dontRender){

		// Bind context
		_.bindAll(this);
			
		_.extend(this,attributes);
		
		// Determine whether specified model is a className, class, or instance
		this.model = this._provisionInstance(this.model,Mast.models,Mast.Model);
			
		if (!this.pattern) {
			if (!this.template) {
				throw new Error ("No pattern or template selector specified for component!");
			}
			else {
				this.pattern = new Mast.Pattern({
					template: this.template,
					model: this.model ? this.model : new Mast.Model
				});
			}
		}
		else {
			if (this.template || this.model) {
				debug.warn ('A template selector and/or model was specified '+
					' even though a pattern was also specified!! \n'+
					'Ignoring extra attributes and using the specified pattern...');
			}
		}
				
		// If this belongs to another component, disable autorender
		if (this.parent) {
			this.autorender = false;
		}
				
		// Maintain dictionary of subcomponents
		this.children = {};
			
		// Watch for changes to pattern
		this.pattern.on('change',this.render);
				
		// Register any subcomponents
		_.each(this.subcomponents,function(properties,key) {
			this.registerSubcomponent(properties,key);
		},this);
				
		// Trigger init event
		_.result(this,'init');
				
		// Watch for and announce statechange events
		this.on('afterRender',this.afterRender);
				
		// Autorender is on by default
		// Default render type is "append", but you can also specify "replaceOutlet""
		if (!dontRender && this.autorender!==false) {
			if (this.replaceOutlet) {
				this.replace()
			}
			else {
				this.append();
			}
		}
				
		// Listen for when the socket is live
		// (unless it's already live)
		if (!Mast.Socket.connected) {
			Mast.Socket.off('connect', this.afterConnect);
			Mast.Socket.on('connect', this.afterConnect);
		}
		else {
			Mast.Socket.off('connect', this.afterConnect);
			this.afterConnect();
		}
	},
		
	// Append the pattern to the outlet
	append: function (outlet) {
		var $outlet = this._verifyOutlet(outlet,
			this.parent && this.parent.$el);
			
		this.render();
		$outlet.append(this.$el);
			
		return this;
	},
		
	// Replace the outlet with the rendered pattern
	replace: function (outlet) {
		var $outlet = this._verifyOutlet(outlet);
				
		this.setElement($outlet);
		this.render();
		return this;
	},
		
	// Render the pattern in-place
	render: function (silent) {
		var $element = this.generate();
		this.$el.replaceWith($element);
		this.setElement($element);
			
		// If any subcomponents exist, 
		_.each(this.children,function(subcomponent,key) {
			// append them to the appropriate outlet
			_.defer(function() {
				subcomponent.append();
			})
		},this);
			
		if (!silent) {
			this.trigger('afterRender');
		}
		return this;
	},
			
	// Use pattern to generate a DOM element
	generate: function (data) {
		data = this._normalizeData(data);
		return $(this.pattern.generate(data));
	},
			
	// Register a new subcomponent from a definition
	registerSubcomponent: function(options,key) {
		var Subcomponent;
				
		if (!options.component) {
			throw new Error("Cannot register subcomponent because 'component' was not defined!");
		}
		else if ( typeof Mast.components[options.component] == "undefined" ) {
			throw new Error("Cannot register subcomponent because specified component, '"+options.component+"', does not exist!");
		}
		else {
			Subcomponent = options.component;
		}
		
		// Provision prototype for subcomponent
		Subcomponent = this._provisionPrototype(Subcomponent,Mast.components,Mast.Component)
				
		// Instantiate subcomponent, but don't append/render it yet
		var subcomponent = new Subcomponent({
			parent: this,
			outlet: options.outlet
		});
		this.children[key] = subcomponent;
	},
			
	// Free the memory for this component and remove it from the DOM
	destroy: function () {
		this.undelegateEvents();
		this.$el.remove();
	},
			
	// Set pattern's template selector
	setTemplate: function (selector){
		return this.pattern.setTemplate(selector);
	},
			
	// Set pattern's model attribute
	set: function (attribute,value){
		return this.pattern.model.set(attribute,value);
	},
			
	afterRender: function(){
	// stub
	},
			
	afterConnect: function(){
	// stub
	},
			
	// Default HTML to display if table is empty and no emptytemplate
	// is specified
	emptyHTML: "<span>There are no rows available.</span>",
			
			
			
	// Determine the proper outlet selector and ensure that it is valid
	_verifyOutlet: function (outlet,context) {
		// If a parent component exists, render into that by default
		outlet = outlet || this.outlet || (this.parent && this.parent.$el);
		
		if (!outlet && !this.parent) {
			throw new Error("No outlet selector specified to render into!");
			return false;
		}
				
		var $outlet;
		if (_.isString(outlet)) {
			$outlet = (context && context.find(outlet)) || $(outlet);
		}
		else {
			$outlet = outlet;
		}
		
		if ($outlet.length != 1) {
			
			debug.debug($outlet,outlet,this.parent.$el);
			throw new Error(
				(($outlet.length > 1)?"More than one ":"No ")+
				(($outlet.length > 1)?"element exists ":"elements exist ")+
				(context?"in this template context ("+context+ ")":"") +
				"for the specified "+
				(context?"child ":"") +
				"outlet selector! ('"+outlet+"')");
			return false;
		}

			
		return $outlet;
	},
	
	// Whether specified identity is a className, class, dictionary, or instance,
	// return an instance
	_provisionInstance: function (identity, identitySet, identityPrototype) {
		
		// Create an instance if necessary
		if (identity && _.isObject(identity) && _.isFunction(identity)) {
			// Function (class definition)
			return new identity({
				// While not necessary for everything, setting autorender to false
				// doesn't hurt, and takes care of anything that DOES render
				autorender: false
			});
		}
		else if (_.isString(identity)) {
			// A string component name
			if (!(identity = (identitySet[identity]))) {
				throw new Error("No identity with that name ("+identity+") exists!");
			}
		}
		else if (_.isObject(identity)) {
			// an attribute list
			if (!identity.cid) {
				try {
					return new identityPrototype(identity);
				}
				catch (e) {
					debug.error("Invalid identity definition: "+identity);
				}
			}
		}
		
		// Else already a Mast component instance, in which case we're good.
		return identity;
	},
	
	// Accept direct reference to prototype or a string and return a prototype
	_provisionPrototype: function (identity, identitySet, identityPrototype) {
		
		if (identity && _.isObject(identity) && _.isFunction(identity)) {
			return identity;
		}
		else if (_.isString(identity)) {
			// A string component name
			if (!(identity = (identitySet[identity]))) {
				throw new Error("No identity with that name ("+identity+") exists!");
			}
		}
		else {
			throw new Error ("Invalid identity provided: " + identity);
		}
		return identity;
	},
			
	// Used for debugging
	_test: function() {
		debug.debug("TEST FUNCTION FIRED!",arguments,this);
	}
}