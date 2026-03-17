1) What changes when you move from Cebu City to Cebu Region

The product stops being a city day-planner and becomes a regional trip planner.

That means:

You cannot assume everything is close together.

Travel time becomes a major part of itinerary generation.

Area clustering becomes mandatory.

Multi-day planning matters much more.

Transport type matters more: car, bus, van, ferry, flights, transfers.

The app needs stronger route logic so it does not create bad plans like combining far-apart destinations in one day.

So the new product mental model becomes:

“What kind of Cebu trip are you planning, and which Cebu area do you want to explore?”

2) Current app pages inferred from the screenshots

These are still the same source pages from the original app flow:

A. Home / Welcome

Welcome card

Create itinerary

Add spots

Import guide

Map background

B. Destination Picker

Search destination

Choose country/city

C. Trip Preferences

Pick interests like food, museum, nature, shopping

D. Trip Duration

Pick number of days

E. Confirmation / Save State

Preferences saved

Continue flow

F. Discover Spots

Browse recommended places

Filter by type

Select places

G. Discover Spots Continued

More grouped places by area

H. Trip Overview

Generated multi-day itinerary

Overview tab

Daily summaries

Map with markers

I. Day Detail / Route View

Stop-by-stop itinerary

Travel time and directions

Day tabs

Optimize action

3) How that flow should change for Cebu Region

The biggest change is that destination selection should no longer be a generic global destination search.

Instead, your planning flow should become:

Home

Region / trip area selection

Trip type and preferences

Duration and transport

Discover places by Cebu cluster

Select spots

Build itinerary

View trip overview

View route/day details

4) Recommended Cebu Region product structure

For Cebu Region, I would organize the app around travel clusters.

Suggested Cebu clusters

These are the clusters I would use in the product:

Metro Cebu

Cebu City

Mandaue

Lapu-Lapu / Mactan

Busay

South Cebu

Carcar

Sibonga

Argao

Dalaguete

Oslob

Moalboal

Badian

Alegria

Samboan

North Cebu

Danao

Carmen

Catmon

Sogod

Medellin

Daanbantayan

Malapascua access area

West / Southwest Cebu

Toledo corridor

Moalboal-Badian side can also sit here depending on your IA

East / Heritage / Scenic Towns

Naga

Minglanilla

San Fernando

Carcar

Argao

Alcoy corridor

Islands

Mactan

Bantayan

Camotes

Malapascua access flow

You do not have to expose these all at once in the UI. Internally, though, your routing logic should use cluster boundaries.

5) Best page set for a Cebu Region app

This is the page structure I’d recommend.

1. Home

Purpose:

Launch planning quickly

Enter popular Cebu trip types fast

Content:

“Plan your Cebu trip”

Quick actions:

Weekend getaway

South Cebu adventure

Metro Cebu food crawl

Beach trip

Heritage route

Build custom itinerary

Saved trips

Recent itineraries

2. Region / Area Selection

Purpose:

Replace global destination picker

Let the user define which part of Cebu they want

Options:

All Cebu

Metro Cebu

South Cebu

North Cebu

Islands

Custom area selection

This page matters a lot because region-scale planning needs geographic constraints early.

3. Plan Setup

Purpose:

Define the travel context

Inputs:

Trip type

Group type

Budget

Travel style

Start point

Transport mode

Examples:

Solo / couple / family / barkada

Nature / food / beaches / heritage / nightlife

Car / commute / hired van / motorbike

Day trip / weekend / 3–5 days

4. Preferences

Purpose:

Choose interests

Cebu-region-specific tags:

Beaches

Waterfalls

Sardine run

Island hopping

Food

Heritage

Churches

Scenic drives

Cafes

Shopping

Nature

Family-friendly

Nightlife

Mountain views

5. Duration / Travel Window

Purpose:

Define how much time is available

Better options than only days:

Half day

1 day

Weekend

3 days

5 days

1 week

Custom start/end date and time

For regional planning, custom dates become more useful.

6. Discover Spots

Purpose:

Explore places by cluster or category

Views:

By area

By type

By curated list

By map

Examples of sections:

Metro highlights

South Cebu must-sees

North Cebu beaches

Family-friendly stops

Food and cafe picks

Nature and adventure

7. Spot Detail

Purpose:

Show full place information before adding it

Content:

Photos

Description

Category

Municipality / area

Estimated visit time

Opening hours

Best time to visit

Travel notes

Nearby places

Add to itinerary

8. Itinerary Builder

Purpose:

Assemble the selected places into a trip

Content:

Ordered stops by day

Route summary

Travel time between stops

Stay duration

Reorder / remove

Optimize route

Overnight suggestions if needed

9. Trip Overview

Purpose:

Display the full multi-day Cebu itinerary

Content:

Regional map

Day cards

Area grouping

Total drive/ferry time

Place count

Overnight stops

Share and save

10. Day / Route Detail

Purpose:

Show detailed execution for one day

Content:

Timeline of stops

Travel segments

Directions

Estimated arrival windows

Notes and reminders

11. Saved Trips

Purpose:

Keep reusable travel plans

Examples:

2-Day South Cebu

Metro Cebu Food Weekend

Bantayan Escape

North Cebu Scenic Road Trip

12. Curated Guides

Purpose:

Give preset plans for faster conversion

Examples:

First-time Cebu

Best 3-day Cebu

Family Cebu trip

Cebu waterfalls route

Cebu beach weekend

Cebu heritage and food

This page is especially useful for region-scale apps because many users do not want to build from zero.

6) Pages to remove, merge, or redesign from the original flow
Remove
Global destination search

You do not need “Where are we going?” across countries.

Replace with
Cebu Area / Cluster Selection

The user chooses which part of Cebu to explore.

Keep

Home

Preferences

Duration

Discover Spots

Trip Overview

Day Detail

Add

Plan Setup

Spot Detail

Itinerary Builder

Saved Trips

Curated Guides

7) Best screen flow for Cebu Region

This is the most practical flow:

Home → Area Selection → Plan Setup → Preferences → Duration → Discover Spots → Itinerary Builder → Trip Overview → Day Detail

Secondary flows:

Home → Curated Guides → Trip Overview

Home → Browse Spots → Spot Detail → Add to Itinerary

Saved Trips → Trip Overview → Day Detail

8) UI components to use

The same visual language from the screenshots still works, but the region version needs stronger planning components.

Core UI components
Navigation

Bottom tab bar

Top navigation bar

Back button

Tab switcher

Stepper / progress indicator

Inputs

Search bar

Filter chips

Multi-select chips

Segmented controls

Wheel picker or sheet picker

Budget slider

Date picker

Start/end time picker

Transport selector

Region selector cards

Content components

Destination cluster cards

Spot cards

List rows with metadata

Section headers

Accordions by area

Day itinerary cards

Map preview cards

Overnight stay cards

Curated guide cards

Actions

Sticky primary CTA

Add/remove toggle

Bookmark/save

Reorder drag handle

Share action

Optimize route button

Map components

Interactive map

Cluster markers

Numbered stop markers

Route polyline

Bottom sheet map overlay

Area boundary highlighting

Feedback components

Skeleton loading states

Empty states

Success states

Snackbar/toast

Inline warnings

Route conflict alerts

9) UI components by page
Home

Use:

Hero card

Quick action grid

Curated guide carousel

Saved trip cards

Sticky “Create trip” button

Area Selection

Use:

Large region cards

Search field

Map mini-preview

Popular cluster chips

Continue button

Plan Setup

Use:

Step form

Chips for trip type

Budget slider

Transport segmented control

Group type selector

Start point selector

Progress stepper

Preferences

Use:

Multi-select chips

Interest cards

Continue CTA

Duration / Travel Window

Use:

Duration chips

Date range picker

Time picker

Optional overnight toggle

Confirm button

Discover Spots

Use:

Search bar

Category tabs

Filter chips

Area accordions

Spot list rows with image and info

Map/list toggle

Sticky “Add spots” button

Spot Detail

Use:

Image carousel

Place metadata chips

Travel notes card

Nearby spots section

Add-to-itinerary CTA

Itinerary Builder

Use:

Day sections

Draggable stops

Travel summary row

Overnight card

Route warnings

Optimize CTA

Trip Overview

Use:

Large map header

Day cards

Totals card

Area summary

Share/save buttons

Day Detail

Use:

Day tabs

Stop timeline

Travel badges

Directions button

Notes field or tips card

Saved Trips

Use:

Search

Filter chips

Trip cards

Duplicate/edit/delete actions

Curated Guides

Use:

Guide cards

Category filters

Featured banner

Save or customize action

10) Implementation plan for Cebu Region

This needs a stronger implementation plan than the Cebu City version because the routing is harder.

Phase 1 — Define scope clearly

Decide what “Cebu region” means in the product.

Recommended scope:

Metro Cebu

South Cebu

North Cebu

Key islands

Curated routes and custom itineraries

Do not launch with every town fully modeled unless your place data is strong. Start with the major tourism corridors first.

Phase 2 — Build the regional place data model

You need a better schema than the city-only version.

Place model

id

name

slug

category

subcategory

municipality

cluster

latitude

longitude

description

photos

opening_hours

best_time_to_visit

average_visit_duration

budget_level

tags

family_friendly

travel_notes

transport_access

is_featured

seasonality

external_map_link

Cluster model

id

name

region_type

center_lat

center_lng

description

recommended_trip_length

featured_places[]

Itinerary model

id

title

scope = Cebu Region

selected_clusters[]

trip_type

transport_mode

group_type

duration

budget

start_point

overnight_required

selected_place_ids[]

ordered_days[]

total_estimated_distance

total_estimated_travel_time

total_estimated_activity_time

created_at

Day plan model

day_number

cluster

stops[]

start_time

end_time

total_drive_time

overnight_location

11) Routing logic you must add for a regional app

This is the most important product logic.

A Cebu Region planner should not just sort by tag match. It needs geographic sanity rules.

V1 itinerary logic

Filter places by selected tags

Filter by selected cluster or area

Score by popularity + fit + distance

Group by nearby places

Generate stops per day

Limit total daily travel time

V2 itinerary logic

Add:

Opening hours

Visit duration

Road travel time

Ferry time

Traffic assumptions

Day start/end windows

Overnight stop suggestions

Core routing rules

You should enforce rules like:

Avoid placing very distant municipalities in the same day

Prefer same-cluster stops first

Use overnight boundaries for long routes

Separate island trips from mainland trips unless explicitly intended

Warn users when their selection is unrealistic

Example rule:
A day trip should stay mostly inside one practical travel corridor unless the user overrides it.

12) Regional clustering rules for itinerary generation

This is the backbone of the app.

Good default itinerary strategy
For 1-day trips

Keep within one cluster only

Examples:

Metro Cebu day

South Cebu single-corridor day

Bantayan day context once already on-island

For 2–3 day trips

Allow 1–2 clusters max

Suggest overnight handoff between clusters

For 4+ day trips

Allow broader regional flow

Build natural progression:

Metro → South

Metro → North

Metro → Island trip

This makes the product smarter and avoids bad itineraries.

13) Suggested Cebu Region filters
Interest filters

Beaches

Waterfalls

Heritage

Food

Cafes

Scenic drives

Churches

Nature

Shopping

Nightlife

Family

Adventure

Island hopping

Practical filters

Open now

Half-day friendly

Day-trip friendly

Good for kids

Good for couples

Budget-friendly

Premium

Walkable area

Outdoor

Indoor

Near hotel / airport

Good for sunset

Good for rainy weather

Area filters

Metro Cebu

Mactan

Busay

South Cebu

North Cebu

Bantayan

Camotes

Trip mode filters

Weekend trip

Road trip

Commute-friendly

Car-friendly

Ferry trip

Relaxed pace

Packed itinerary

14) Recommended pages to build first

To ship faster, build these first:

MVP pages

Home

Area Selection

Plan Setup

Preferences

Duration

Discover Spots

Itinerary Builder

Trip Overview

Day Detail

Phase 2 pages

Spot Detail

Saved Trips

Curated Guides

That gets you a usable product quickly without overbuilding.

15) Recommended simplified MVP flow

The original app has a bit of friction. For a regional Cebu app, I’d simplify the user flow to this:

Fast flow

Choose Cebu area

Choose trip style

Choose duration

Pick spots or auto-generate

Review itinerary

Advanced flow

Choose area

Choose transport

Choose preferences

Choose dates

Build custom route

Save/share trip

This gives you both beginner and power-user behavior.

16) Information architecture for the Cebu Region app

A clean IA would look like this:

Bottom tabs

Home

Explore

Trips

Saved

Profile

Under Explore

Areas

Spots

Guides

Map

Under Trips

Build itinerary

Overview

Day details

This structure scales better than a single linear flow.

17) Design recommendations specific to regional travel

For a city app, compact cards are enough. For a regional app, the UI must communicate distance and travel cost better.

So each spot card should show:

Area

Estimated visit time

Travel relevance

Category

Open/closed status

Good-for tags

Each route/day card should show:

Total travel time

Number of stops

Overnight required or not

Cluster name

Each generated itinerary should show:

Route realism

Pace

Drive/ferry warnings

Suggested overnight point

18) Best product positioning for this version

This app should feel like:

“A Cebu trip planner and regional guide”

Not:

only a city guide

only a map browser

only a checklist app

The strongest value is:

curated discovery

smarter regional itinerary generation

fast trip building by area and trip style

19) Final recommended page list

For the Cebu Region version, make these pages:

Home

Area Selection

Plan Setup

Preferences

Duration / Travel Window

Discover Spots

Spot Detail

Itinerary Builder

Trip Overview

Day Detail

Saved Trips

Curated Guides

20) Final recommendation on what to remove from the original app

Remove:

Global destination search

Replace with:

Cebu area selection

Cluster-aware planning

Region-based discovery

Keep:

Preferences

Duration

Spot discovery

Itinerary generation

Trip overview

Daily route view

Add:

Area selection

Spot detail

Itinerary builder

Saved trips

Curated guides