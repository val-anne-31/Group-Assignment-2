// Monthly choropleth: AI job postings (company_location + posting_date -> YYYY-MM)
// Expects ai_job_dataset.csv in same folder, with posting_date (YYYY-MM-DD) and company_location

const container = d3.select("#map");
const tooltip = d3.select("#tooltip");
const slider = d3.select("#monthSlider");
const monthLabel = d3.select("#monthLabel");
const playBtn = d3.select("#playPause");
const legendDiv = d3.select("#legend");

const WIDTH = 1000;
const TOP_MARGIN = 30;
const HEIGHT = Math.round(WIDTH / 2) + TOP_MARGIN;

const svg = container.append("svg")
  .attr("viewBox", `0 0 ${WIDTH} ${HEIGHT}`)
  .attr("preserveAspectRatio", "xMidYMid meet");

// projection will be fit to features after loading topojson
const projection = d3.geoEqualEarth();
const path = d3.geoPath(projection);

// load world topojson and CSV
Promise.all([
  d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"),
  d3.csv("ai_job_dataset.csv", d3.autoType)
]).then(([world, jobs]) => {
  // prepare countries features
  const countries = topojson.feature(world, world.objects.countries).features;
  const countryMesh = topojson.mesh(world, world.objects.countries, (a,b) => a !== b);

  // parse jobs: create month string YYYY-MM and use company_location as country
  jobs.forEach(d => {
    // safe parse posting_date
    try {
      const dt = new Date(d.posting_date);
      if (isNaN(dt)) {
        d.month = null;
      } else {
        const y = dt.getFullYear();
        const m = (dt.getMonth() + 1).toString().padStart(2, "0");
        d.month = `${y}-${m}`;
      }
      d.country = d.company_location;
    } catch {
      d.month = null;
      d.country = d.company_location;
    }
  });

  // only keep valid months and countries
  const valid = jobs.filter(d => d.month && d.country && d.country.length);

  // rollup: Map month -> Map(country -> count)
  const dataByMonth = d3.rollup(
    valid,
    v => v.length,
    d => d.month,
    d => d.country
  );

  // sorted months array
  const months = Array.from(new Set(valid.map(d => d.month))).sort((a,b) => {
    // lexical YYYY-MM sorts correctly; ensure this:
    return a.localeCompare(b);
  });

  if (months.length === 0) {
    container.append("div").text("No valid posting_date / company_location data found.");
    return;
  }

  // compute global max count across months (for color domain)
  let globalMax = 0;
  for (const m of dataByMonth.keys()) {
    const map = dataByMonth.get(m);
    for (const v of map.values()) if (v > globalMax) globalMax = v;
  }
  if (globalMax === 0) globalMax = 1;

  // color scale (sequential)
  const color = d3.scaleSequential()
    .domain([0, globalMax])
    .interpolator(d3.interpolateYlGnBu);

  // draw legend
  drawLegend(legendDiv.node(), color, globalMax);

  // fit projection to countries within svg extents
  projection.fitExtent([[10, TOP_MARGIN + 4], [WIDTH - 10, HEIGHT - 4]], { type: "FeatureCollection", features: countries });

  // base country paths
  const countryG = svg.append("g").attr("class", "countries");
  const countryPaths = countryG.selectAll("path")
    .data(countries)
    .join("path")
      .attr("d", path)
      .attr("fill", "#eee")
      .attr("stroke", "#999")
      .attr("stroke-width", 0.4)
      .style("cursor", "pointer")
      .on("mousemove", (event, d) => {
        const month = months[slider.node().valueAsNumber];
        const count = (dataByMonth.get(month) && dataByMonth.get(month).get(d.properties.name)) || 0;
        tooltip.style("display", "block")
          .style("left", (event.pageX + 12) + "px")
          .style("top", (event.pageY + 10) + "px")
          .html(`<strong>${d.properties.name}</strong><br/>${count} postings (${month})`);
      })
      .on("mouseout", () => tooltip.style("display", "none"));

  // mesh overlay
  svg.append("path")
    .datum(countryMesh)
    .attr("fill", "none")
    .attr("stroke", "white")
    .attr("stroke-width", 0.6)
    .attr("d", path)
    .style("pointer-events", "none");

  // prepare slider
  slider.attr("min", 0).attr("max", Math.max(0, months.length - 1)).attr("value", 0);
  monthLabel.text(months[0]);

  // slider update function
  function update(monthIndex, transition = true) {
    const month = months[monthIndex];
    const map = dataByMonth.get(month) || new Map();

    const t = transition ? d3.transition().duration(450) : d3.transition().duration(0);

    countryPaths.transition(t)
      .attr("fill", d => {
        const val = map.get(d.properties.name) || 0;
        return val > 0 ? color(val) : "#eee";
      });

    monthLabel.text(month);
  }

  // initial render
  update(0, false);

  // slider event
  slider.on("input", function() {
    update(+this.value, true);
  });

  // Play/pause simple animation
  let playing = false;
  let timer = null;
  playBtn.on("click", () => {
    playing = !playing;
    playBtn.text(playing ? "Pause" : "Play");
    if (playing) {
      timer = d3.interval(() => {
        const cur = +slider.node().value;
        const next = (cur + 1) % months.length;
        slider.node().value = next;
        update(next);
        if (next === months.length - 1 && !playing) { timer.stop(); }
      }, 800);
    } else {
      if (timer) timer.stop();
    }
  });

}).catch(err => {
  console.error(err);
  container.append("div").text("Error loading data or world map. See console for details.");
});


// small legend renderer: draws a horizontal gradient + numeric ticks
function drawLegend(containerNode, scale, maxVal) {
  const w = 260, h = 44;
  const svgL = d3.create("svg").attr("width", w).attr("height", h).style("display","block");
  const defs = svgL.append("defs");
  const gradId = "legend-gradient";
  const gradient = defs.append("linearGradient").attr("id", gradId).attr("x1","0%").attr("x2","100%");
  const stops = 8;
  for (let i=0;i<=stops;i++) {
    gradient.append("stop")
      .attr("offset", `${(i/stops)*100}%`)
      .attr("stop-color", scale((i/stops)*maxVal));
  }
  svgL.append("rect").attr("x",8).attr("y",8).attr("width", w-16).attr("height",12).attr("fill", `url(#${gradId})`).attr("rx",2);
  // ticks
  const ticks = [0, Math.round(maxVal/2), Math.round(maxVal)];
  svgL.append("g").attr("transform", `translate(8,26)`)
    .selectAll("text")
    .data(ticks)
    .join("text")
      .attr("x", (d,i) => i*( (w-16)/(ticks.length-1) ))
      .attr("y", 12)
      .attr("fill","#333")
      .attr("font-size",11)
      .text(d => d);
  svgL.append("text").attr("x", 8).attr("y", 12).attr("font-size",11).attr("fill","#333").text("Postings");
  d3.select(containerNode).node().appendChild(svgL.node());
}
