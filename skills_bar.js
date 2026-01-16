(function () {
  const margin = { top: 80, right: 45, bottom: 100, left: 320 };

  const ACTIVE_COLOR = "#1f77b4";
  const INACTIVE_COLOR = "#cfcfcf";
  const INACTIVE_OPACITY = 0.55;

  const container = d3.select("#skillsChart");
  const tooltip = d3.select("#tooltip");

  // Make sure the container exists
  if (container.empty()) return;

  // Build SVG
  const width = 1400;
  const height = 900;

  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("width", "100%")
    .style("height", "auto")
    .style("display", "block");

  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear().range([0, innerW]);
  const y = d3.scaleBand().range([0, innerH]).padding(0.12);

  const gridG = g.append("g").attr("class", "grid");
  const xAxisG = g.append("g")
    .attr("transform", `translate(0,${innerH})`)
    .attr("class", "axis");
  const yAxisG = g.append("g").attr("class", "axis");

  // Title
  const title = svg.append("text")
    .attr("class", "title")
    .attr("x", margin.left + innerW / 2)
    .attr("y", 40)
    .attr("text-anchor", "middle")
    .text("Demand for Selected Skills Across AI Job Roles");

  // Axis labels
  svg.append("text")
    .attr("x", margin.left + innerW / 2)
    .attr("y", height - 25)
    .attr("text-anchor", "middle")
    .style("font-size", "16px")
    .style("font-weight", "800")
    .style("fill", "#333")
    .text("Number of Job Postings");

  svg.append("text")
    .attr("transform", `translate(55,${margin.top + innerH / 2}) rotate(-90)`)
    .attr("text-anchor", "middle")
    .style("font-size", "16px")
    .style("font-weight", "800")
    .style("fill", "#333")
    .text("Job Role");

  const skillsPanel = d3.select("#skillsList");

  const DATA_PATH = "ai_job_dataset.csv";

  function splitSkills(skillStr) {
    if (!skillStr) return [];
    return skillStr.split(",").map(s => s.trim()).filter(Boolean);
  }

  function showTooltip(event, html) {
    tooltip
      .style("display", "block")
      .html(html);

    const tipW = 280;
    const tipH = 90;

    let left = event.pageX + 12;
    let top = event.pageY + 12;

    if (left + tipW > window.innerWidth) left = event.pageX - tipW - 12;
    if (top + tipH > window.innerHeight) top = event.pageY - tipH - 12;

    tooltip.style("left", left + "px").style("top", top + "px");
  }

  function hideTooltip() {
    tooltip.style("display", "none");
  }

  d3.csv(DATA_PATH, d => ({
    job_title: d.job_title,
    skills: splitSkills(d.required_skills)
  }))
    .then(rows => {
      const allSkills = Array.from(new Set(rows.flatMap(r => r.skills)))
        .sort((a, b) => {
          if (a === "Python") return -1;
          if (b === "Python") return 1;
          return d3.ascending(a, b);
        });

      let selectedSkills = new Set(["Python"].filter(s => allSkills.includes(s)));
      if (selectedSkills.size === 0 && allSkills.length > 0) selectedSkills = new Set([allSkills[0]]);

      skillsPanel.selectAll("div.skillItem")
        .data(allSkills)
        .join("div")
        .attr("class", "skillItem")
        .each(function (skill) {
          const row = d3.select(this);

          row.append("input")
            .attr("type", "checkbox")
            .property("checked", selectedSkills.has(skill))
            .on("change", function () {
              this.checked ? selectedSkills.add(skill) : selectedSkills.delete(skill);

              if (selectedSkills.size === 0) {
                selectedSkills.add("Python");
                skillsPanel.selectAll("input")
                  .property("checked", d => selectedSkills.has(d));
              }
              updateChart();
            });

          row.append("span").text(skill);
        });

      function aggregateTotals() {
        const filtered = rows.filter(r => r.skills.some(s => selectedSkills.has(s)));

        const totals = d3.rollups(
          filtered,
          v => v.length,
          d => d.job_title
        ).map(([job_title, total]) => ({ job_title, total }));

        return totals.sort((a, b) => d3.descending(a.total, b.total)).slice(0, 20);
      }

      function updateChart() {
        const totals = aggregateTotals();

        title.text("Demand for Selected Skills Across AI Job Roles");

        x.domain([0, d3.max(totals, d => d.total) || 0]).nice();
        y.domain(totals.map(d => d.job_title));

        gridG.transition().duration(600)
          .call(d3.axisBottom(x).ticks(8).tickSize(-innerH).tickFormat(""))
          .call(g => g.selectAll(".tick line").attr("stroke", "#e0e0e0").attr("stroke-dasharray", "4,4"))
          .call(g => g.select(".domain").remove());

        xAxisG.transition().duration(600).call(d3.axisBottom(x).ticks(8));
        yAxisG.transition().duration(600).call(d3.axisLeft(y));

        const bars = g.selectAll("rect.bar")
          .data(totals, d => d.job_title);

        bars.join(
          enter => enter.append("rect")
            .attr("class", "bar")
            .attr("x", 0)
            .attr("y", d => y(d.job_title))
            .attr("height", y.bandwidth())
            .attr("width", 0)
            .attr("fill", ACTIVE_COLOR)
            .attr("opacity", 1)
            .attr("rx", 6)
            .attr("ry", 6)
            .attr("stroke", "#ffffff")
            .attr("stroke-width", 1.5)
            .attr("stroke-opacity", 0.7)
            .on("mouseenter", function (event, d) {
              g.selectAll("rect.bar")
                .interrupt()
                .attr("fill", INACTIVE_COLOR)
                .attr("opacity", INACTIVE_OPACITY);

              d3.select(this)
                .interrupt()
                .attr("fill", ACTIVE_COLOR)
                .attr("opacity", 1)
                .raise();

              showTooltip(event,
                `<strong>${d.job_title}</strong><br>Postings: <strong>${d.total.toLocaleString()}</strong>`
              );
            })
            .on("mousemove", function (event) {
              // keep tooltip following cursor
              const html = tooltip.html();
              showTooltip(event, html);
            })
            .on("mouseleave", function () {
              g.selectAll("rect.bar")
                .interrupt()
                .attr("fill", ACTIVE_COLOR)
                .attr("opacity", 1);

              hideTooltip();
            })
            .call(enter => enter.transition().duration(800)
              .delay((d, i) => i * 40)
              .attr("width", d => x(d.total))
            ),

          update => update
            .attr("fill", ACTIVE_COLOR)
            .attr("opacity", 1)
            .call(update => update.transition().duration(700)
              .attr("y", d => y(d.job_title))
              .attr("height", y.bandwidth())
              .attr("width", d => x(d.total))
            ),

          exit => exit.transition().duration(400)
            .attr("width", 0)
            .remove()
        );
      }

      updateChart();
    })
    .catch(err => {
      console.error(err);
      container.html(
        `<p style="color:red;font-size:16px;font-weight:700;text-align:center;padding:24px;">
          CSV load failed: ${err}
        </p>`
      );
    });
})();
