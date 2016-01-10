;(function($){$(function() {

// UTIL
var extend = function(to, from)
{
  var own = {}.hasOwnProperty;
  for (var k in from) if (own.call(from, k)) to[k] = from[k];
  return to;
};

// GEOCODING APIs
var googleKey = null;
var googleGeocode = function(addr, options)
{
  // munge the google return format.
  var oldSuccess = options.success;
  options.success = function(result)
  {
    result = [ result.results[0].geometry.location ];
    result[0].lon = result[0].lng;
    oldSuccess(result);
  };

  // make the request from google.
  $.ajax(extend({
    dataType: 'json',
    url: 'https://maps.googleapis.com/maps/api/geocode/json?address=' + encodeURIComponent(addr) + '&key=' + googleKey,
  }, options));
};
var osmGeocode = function(addr, options)
{
  // make the request from nominatim.
  $.ajax(extend({
    dataType: 'json',
    url: 'https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(addr),
  }, options));
};

// UI PIECES
// auto geolocation
var byMagicButton = $('#by-magic');
//   first disable button if we don't have geolocation.
if (!('geolocation' in navigator))
  byMagicButton.attr('disabled', 'disabled').attr('title', 'Please enable location services to use this feature');

//   actually trigger if we are clicked.
byMagicButton.on('click', function()
{
  // set state.
  resetAll();
  var ourAttempt = nextAttempt();
  byMagicButton.addClass('working').attr('disabled', 'disabled');

  // use browser geolocation. rough is fine.
  navigator.geolocation.getCurrentPosition(function(position)
  {
    byMagicButton.removeClass('working').attr('disabled', null);
    if (ourAttempt !== attempt) return;
    findForLatLon(position.coords.latitude, position.coords.longitude);
  },
  function(error)
  {
    console.log(error);
  });
});

// by address
var byAddressForm = $('#by-address-form');
var byAddressButton = $('#by-address');
byAddressForm.on('submit', function(event)
{
  event.preventDefault();
  var addr = $('#address').blur().val();

  // if they didn't specify chicago, tack it on.
  if (/chicago/i.test(addr) !== true)
    addr = addr + ', Chicago, IL';

  // set state.
  resetAll();
  var ourAttempt = nextAttempt();
  byAddressButton.addClass('working').attr('disabled', 'disabled');

  // make the request from nominatim.
  (googleKey === null ? osmGeocode : googleGeocode)(addr, {
    complete: function()
    {
      byAddressButton.removeClass('working').attr('disabled', null);
    },
    error: function(xhr, errorType, error) { console.log(error); },
    success: function(result)
    {
      // first, make sure we got something.
      if (!result || !result[0])
        return panic('Sorry, we\u2019re not entirely sure where that is. Please check the address and try again.');

      // next make sure we're the most modern attempt.
      if (ourAttempt !== attempt) return;

      // then go do it.
      findForLatLon(parseFloat(result[0].lat), parseFloat(result[0].lon));
    }
  });
});


// CONTROL FLOW
var attempt = 0;
var resultSection = $('#result');
var errorSection = $('#error');
var mapSection = $('#map');
var theMap = $('#the-map');

// called when some attempt is made to relocate.
var resetAll = function()
{
  resultSection.hide();
  errorSection.hide();
  mapSection.hide();
};

// keep track of what the most modern attempt is so an old one returning slowly
// doesn't freak things out.
var nextAttempt = function() { return ++attempt; };

// actually go find the ward and then ward information given a latlong.
var findForLatLon = function(lat, lon)
{
  // HACK: pretend i'm in chicago for testing.
  // lat = 41.88025; lon = -87.637953;

  // step 1: ask soda for which ward is relevant.
  $.ajax({
    dataType: 'json',
    url: 'https://data.cityofchicago.org/resource/k9yb-bpqx.json?$where=within_polygon(%27POINT%20(' + lon + '%20' + lat + ')%27,the_geom)&$select=ward',
    complete: function() {  },
    error: function(xhr, errorType, error) { console.log(error); },
    success: function(result)
    {
      // step 1.5: make sure we actually found a thing.
      if (!result || !result[0] || !result[0].ward)
      {
        showMap(lat, lon); // show map so that they know where we think they are.
        return panic('Your location doesn\u2019t seem to be located within any ward.');
      }

      // step 2: ask soda for details about that ward.
      var ward = result[0].ward;
      $.ajax({
        dataType: 'json',
        url: 'https://data.cityofchicago.org/resource/7ia9-ayc2.json?ward=' + ward,
        complete: function() {  },
        error: function(xhr, errorType, error) { console.log(error); },
        success: function(result)
        {
          // step 2.5: make really sure we actually found a thing.
          if (!result || !result[0] || !result[0].alderman)
          {
            return panic('For some reason we couldn\u2019t find information about Ward ' + ward);
          }

          // step 3: render details.
          showMap(lat, lon);
          resultSection.show();

          var wardDetails = result[0];
          $('#alderman-name').text(wardDetails.alderman);
          $('#alderman-ward').text(wardDetails.ward);
          $('#alderman-phone').text(wardDetails.ward_phone).attr('href', 'tel:' + wardDetails.ward_phone);
          $('#alderman-email').text(wardDetails.email).attr('href', 'mailto:' + wardDetails.email);
          $('#alderman-ward-office').text(wardDetails.address);
          $('#alderman-cityhall-office').text(wardDetails.city_hall_address);
        }
      });
    }
  });
};

// show a map for a given lat/long.
var baseSource = new ol.source.Stamen({ layer: 'toner-hybrid' });
var map;
var showMap = function(lat, lon)
{
  mapSection.show();

  var targetView = new ol.View({
    center: ol.proj.transform([ lon, lat ], 'EPSG:4326', 'EPSG:3857'),
    zoom: 15
  });

  if (!map)
  {
    var map = new ol.Map({
      layers: [ new ol.layer.Tile({ source: baseSource }) ],
      target: theMap.get(0),
      interactions: [
        new ol.interaction.PinchZoom(),
        new ol.interaction.MouseWheelZoom()
      ],
      view: targetView
    });
  }
  else
  {
    map.setView(targetView);
  }
};

// error message display.
var panic = function(error)
{
  errorSection.show();
  $('#the-error').text(error);
};


// start by resetting.
resetAll();

})})(Zepto);

