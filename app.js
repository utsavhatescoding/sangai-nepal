(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const all = (selector) => [...document.querySelectorAll(selector)];
  const CONFIG = window.SANGAI_CONFIG || {};
  const configured = Boolean(CONFIG.supabaseUrl && CONFIG.supabasePublishableKey && window.supabase);
  const client = configured
    ? window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabasePublishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      })
    : null;

  const state = {
    session: null,
    user: null,
    profile: null,
    privateProfile: null,
    rides: [],
    saved: new Set(),
    passengers: 1,
    filter: "all",
    journeyTab: "driver",
    driverRides: [],
    passengerRequests: [],
    incomingRequests: [],
    conversations: [],
    activeConversation: null,
    activeMessages: [],
    pendingView: null,
    pendingAction: null,
    authMode: "login",
    channels: []
  };

  const protectedViews = new Set(["offer", "journeys", "inbox", "profile", "safety"]);
  const iso = (date) => date.toISOString().slice(0, 10);
  const futureDate = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return iso(d); };
  const selectedDate = () => $("dateInput").value || futureDate(1);
  const money = (value) => `Rs. ${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  const escapeHtml = (value = "") => String(value)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const initials = (name = "Sangai Member") => name.split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join("").toUpperCase();
  const avatarMarkup = (name, url = "", className = "driver-avatar") => url
    ? `<span class="${className} has-photo"><img src="${escapeHtml(url)}" alt="${escapeHtml(name || "Sangai member")}" loading="lazy" referrerpolicy="no-referrer" /></span>`
    : `<span class="${className}">${initials(name)}</span>`;
  const prettyDate = (date) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${date}T00:00:00`));
  const longDate = (date) => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${date}T00:00:00`));
  const dayLabel = (date) => date === futureDate(0) ? "today" : date === futureDate(1) ? "tomorrow" : `on ${prettyDate(date)}`;
  const durationText = (minutes) => {
    const total = Number(minutes || 0);
    const h = Math.floor(total / 60);
    const m = total % 60;
    return [h ? `${h} hr` : "", m ? `${m} min` : ""].filter(Boolean).join(" ") || "—";
  };
  const parseDuration = (value) => {
    const text = String(value || "").toLowerCase();
    const h = Number((text.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hour)/) || [])[1] || 0);
    const m = Number((text.match(/(\d+)\s*(?:m|min)/) || [])[1] || 0);
    return Math.max(15, Math.round(h * 60 + m || Number(value) || 60));
  };
  const flexibilityText = (minutes) => Number(minutes) ? `± ${Number(minutes)} minutes` : "Exact time";
  const parseFlexibility = (value) => Number((String(value).match(/\d+/) || [0])[0]);
  const timeShort = (value = "") => String(value).slice(0, 5);
  const statusLabel = (status = "") => status.replaceAll("_", " ").replaceAll("-", " ");
  const maskPlate = (value = "") => {
    const clean = value.trim();
    if (!clean) return "Vehicle details private";
    return clean.replace(/([A-Za-z0-9]{2,4})$/, (match) => "•".repeat(match.length));
  };

  function toast(message) {
    const node = document.createElement("div");
    node.className = "toast";
    node.textContent = message;
    $("toastArea").appendChild(node);
    setTimeout(() => node.remove(), 3400);
  }

  function loadingHtml(title = "Loading", message = "Please wait a moment.") {
    return `<div class="loading-state"><div class="loading-spinner"></div><strong>${escapeHtml(title)}</strong>${escapeHtml(message)}</div>`;
  }

  function openModal(id) {
    $(id)?.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  function closeModal(id) {
    $(id)?.classList.add("hidden");
    document.body.style.overflow = "";
  }

  function showSetupMessage() {
    $("genericModalContent").innerHTML = `<div class="generic-modal-content"><h2>Service temporarily unavailable</h2><p>The secure database connection is unavailable. Please refresh after a moment or contact Sangai support.</p><div class="generic-modal-actions"><button class="primary-btn full-btn" data-close="genericModal">Done</button></div></div>`;
    openModal("genericModal");
  }

  function requireAuth(action, targetView = null) {
    if (!configured) { showSetupMessage(); return false; }
    if (!state.session) {
      state.pendingAction = typeof action === "function" ? action : null;
      state.pendingView = targetView;
      openAuth("login");
      return false;
    }
    if (typeof action === "function") action();
    return true;
  }

  function setView(view) {
    if (protectedViews.has(view) && !state.session) {
      requireAuth(null, view);
      return;
    }
    all(".view").forEach(v => v.classList.add("hidden"));
    $(`${view}View`)?.classList.remove("hidden");
    all("[data-view]").forEach(btn => btn.classList.toggle("active", btn.dataset.view === view));
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (view === "journeys") { loadJourneys(); markNotificationsRead(); }
    if (view === "inbox") loadConversations();
    if (view === "profile" || view === "safety") renderProfile();
  }

  function normalizeRide(row) {
    const profile = row.driver || {};
    const verified = Boolean(row.driver_identity_verified ?? profile.identity_verified) && Boolean(row.driver_licence_verified ?? profile.licence_verified);
    return {
      id: row.id,
      driverId: row.driver_id,
      origin: row.origin,
      destination: row.destination,
      pickup: row.pickup_point,
      dropoff: row.dropoff_point,
      stops: row.stops || [],
      date: row.departure_date,
      time: timeShort(row.departure_time),
      duration: durationText(row.duration_minutes),
      durationMinutes: row.duration_minutes,
      flexibility: flexibilityText(row.flexibility_minutes),
      flexibilityMinutes: row.flexibility_minutes,
      seats: Number(row.available_seats),
      totalSeats: Number(row.total_seats),
      price: Number(row.price_per_seat),
      luggage: row.luggage,
      approval: row.approval_mode,
      vehicle: row.vehicle_model,
      colour: row.vehicle_colour,
      plate: row.vehicle_plate_masked,
      driver: row.driver_name || profile.full_name || "Sangai member",
      avatar: row.driver_avatar_url || profile.avatar_url || "",
      rating: Number(row.driver_rating ?? profile.average_rating ?? 0),
      completed: Number(row.driver_completed_rides ?? profile.completed_rides ?? 0),
      phoneVerified: Boolean(row.driver_phone_verified ?? profile.phone_verified),
      identityVerified: Boolean(row.driver_identity_verified ?? profile.identity_verified),
      licenceVerified: Boolean(row.driver_licence_verified ?? profile.licence_verified),
      vehicleVerified: Boolean(row.driver_vehicle_verified ?? profile.vehicle_verified),
      verified,
      womenPreferred: Boolean(row.women_preferred),
      instant: row.approval_mode === "instant",
      preferences: [row.no_smoking ? "No smoking" : null, row.music_ok ? "Music is okay" : null, row.women_preferred ? "Women preferred" : null, row.pets_allowed ? "Pets allowed" : null].filter(Boolean),
      status: row.status,
      raw: row
    };
  }

  function updateConnectionUI() {
    const banner = $("setupBanner");
    banner?.classList.toggle("hidden", configured);
    if (!configured) {
      if (banner) banner.innerHTML = `<strong>Service temporarily unavailable.</strong><span>Please try again shortly.</span>`;
      $("rideList").innerHTML = `<div class="loading-state"><strong>Journeys are temporarily unavailable</strong>Please refresh after a moment.</div>`;
      return;
    }
    if (banner) banner.innerHTML = "";
  }

  function updateAuthUI() {
    const loggedIn = Boolean(state.session);
    $("authButton").classList.toggle("hidden", loggedIn);
    $("avatarBtn").classList.toggle("hidden", !loggedIn);
    if (loggedIn) {
      const name = state.profile?.full_name || state.user?.user_metadata?.full_name || state.user?.email || "Sangai member";
      $("avatarBtn").textContent = initials(name);
    }
    updateConnectionUI();
  }

  async function loadProfile() {
    if (!state.user) return;
    const [{ data: profile, error: pError }, { data: privateProfile, error: ppError }] = await Promise.all([
      client.from("profiles").select("*").eq("id", state.user.id).single(),
      client.from("private_profiles").select("*").eq("user_id", state.user.id).single()
    ]);
    if (pError) console.warn("Profile load:", pError.message);
    if (ppError) console.warn("Private profile load:", ppError.message);
    state.profile = profile || null;
    state.privateProfile = privateProfile || null;
    updateAuthUI();
    renderProfile();
  }

  async function loadSaved() {
    state.saved.clear();
    if (!state.user) return;
    const { data, error } = await client.from("saved_rides").select("ride_id").eq("user_id", state.user.id);
    if (error) { console.warn("Saved rides:", error.message); return; }
    (data || []).forEach(row => state.saved.add(row.ride_id));
    renderRides();
  }

  async function markNotificationsRead() {
    if (!state.user) return;
    const { error } = await client.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", state.user.id).is("read_at", null);
    if (!error) loadNotifications();
  }

  async function loadNotifications() {
    if (!state.user) {
      document.querySelector(".notification-btn span")?.classList.add("hidden");
      return;
    }
    const { count, error } = await client.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", state.user.id).is("read_at", null);
    if (error) return;
    const badge = document.querySelector(".notification-btn span");
    badge.textContent = String(count || 0);
    badge.classList.toggle("hidden", !count);
  }

  async function searchRides({ scroll = false } = {}) {
    if (!configured) { updateConnectionUI(); return; }
    $("rideList").innerHTML = loadingHtml("Finding rides", "Checking the shared departure board.");
    const params = {
      p_from: $("fromInput").value.trim() || null,
      p_to: $("toInput").value.trim() || null,
      p_date: selectedDate() || null,
      p_seats: state.passengers
    };
    const { data, error } = await client.rpc("search_rides", params);
    if (error) {
      console.error(error);
      $("rideList").innerHTML = `<div class="empty-state"><strong>Could not load rides.</strong><br>${escapeHtml(error.message)}</div>`;
      return;
    }
    state.rides = (data || []).map(normalizeRide);
    renderRides();
    if (scroll) $("results").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function filteredRides() {
    let rides = state.rides.filter(r => {
      if (state.filter === "verified" && !r.verified) return false;
      if (state.filter === "women" && !r.womenPreferred) return false;
      if (state.filter === "instant" && !r.instant) return false;
      return true;
    });
    const sort = $("sortSelect").value;
    rides.sort((a, b) => sort === "price" ? a.price - b.price : sort === "rating" ? b.rating - a.rating : new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`));
    return rides;
  }

  function rideCard(ride) {
    const saved = state.saved.has(ride.id);
    const tags = [];
    if (ride.verified) tags.push("Verified driver");
    if (ride.womenPreferred) tags.push("Women preferred");
    if (ride.instant) tags.push("Instant approval");
    return `<article class="ride-card">
      <div class="ride-card-main">
        <div class="ride-card-top"><span class="departure-tag">${prettyDate(ride.date).toUpperCase()} · ${escapeHtml(ride.time)}</span><div class="ride-tags">${tags.map(t => `<span>${escapeHtml(t)}</span>`).join("")}</div></div>
        <div class="route-block"><div class="route-track"><i class="track-dot"></i><i class="track-line"></i><i class="track-dot end"></i></div><div class="route-names"><div><strong>${escapeHtml(ride.origin)}</strong><span>${escapeHtml(ride.pickup)}</span></div><div><strong>${escapeHtml(ride.destination)}</strong><span>${escapeHtml(ride.dropoff)}</span></div></div><div class="route-duration"><span>TRAVEL TIME</span><strong>${escapeHtml(ride.duration)}</strong></div></div>
        <div class="ride-meta"><span><svg viewBox="0 0 24 24"><path d="M4 14h16l-2-5H7l-3 5Z"/><path d="M6 14v4m12-4v4M7 18h10"/></svg>${escapeHtml(ride.vehicle)}</span><span><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>${ride.seats} seat${ride.seats === 1 ? "" : "s"} left</span><span><svg viewBox="0 0 24 24"><path d="M6 4h12v16H6V4Z"/><path d="M9 8h6"/></svg>${escapeHtml(ride.luggage)}</span></div>
      </div>
      <div class="ride-side"><div class="driver-mini">${avatarMarkup(ride.driver, ride.avatar)}<div><strong>${escapeHtml(ride.driver)}</strong><span>${ride.rating ? `★ ${ride.rating.toFixed(1)}` : "New member"} · ${ride.completed} completed</span></div></div><div class="price-block"><span>CONTRIBUTION / SEAT</span><strong>${money(ride.price)}</strong></div><div class="ride-actions"><button class="save-btn ${saved ? "saved" : ""}" data-save="${ride.id}" aria-label="Save ride"><svg viewBox="0 0 24 24"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z"/></svg></button><button class="view-ride-btn" data-open-ride="${ride.id}">View details</button></div></div>
    </article>`;
  }

  function renderRides() {
    if (!configured) { updateConnectionUI(); return; }
    const rides = filteredRides();
    $("rideList").innerHTML = rides.length ? rides.map(rideCard).join("") : `<div class="empty-state"><strong>No matching ride yet.</strong><br>Try a nearby pickup point or another date.</div>`;
    $("resultCount").textContent = `${rides.length} ride${rides.length === 1 ? "" : "s"}`;
    $("routeSummary").textContent = `${$("fromInput").value || "Anywhere"} → ${$("toInput").value || "Anywhere"}`;
    $("resultTitle").textContent = `Rides ${dayLabel(selectedDate())}`;
  }

  function ownRequestForRide(rideId) {
    return state.passengerRequests.find(q => q.ride_id === rideId && !["declined", "cancelled"].includes(q.status));
  }

  function openRide(id) {
    const ride = state.rides.find(x => x.id === id) || state.driverRides.map(normalizeRide).find(x => x.id === id) || state.passengerRequests.map(q => q.ride ? normalizeRide(q.ride) : null).find(x => x?.id === id);
    if (!ride) return;
    const already = ownRequestForRide(id);
    const ownRide = state.user?.id === ride.driverId;
    const verification = [ride.phoneVerified ? "Phone" : null, ride.identityVerified ? "ID" : null, ride.licenceVerified ? "Licence" : null, ride.vehicleVerified ? "Vehicle" : null].filter(Boolean);
    let requestContent;
    if (ownRide) {
      requestContent = `<p>This is your published ride. Manage requests and status from My journeys.</p><button class="primary-btn" data-view="journeys">Manage ride</button>`;
    } else if (already) {
      requestContent = `<p>Your request status is <strong>${escapeHtml(statusLabel(already.status))}</strong>. Manage it from My journeys.</p><button class="primary-btn" data-view-request>View request</button>`;
    } else if (!state.session) {
      requestContent = `<p>Log in to introduce yourself and request ${state.passengers} seat${state.passengers > 1 ? "s" : ""}.</p><button class="primary-btn" data-login-request="${ride.id}">Log in to request</button>`;
    } else {
      requestContent = `<p>Tell the driver where you will join and what luggage you have.</p><label>Pickup point<select id="requestPickup"><option>${escapeHtml(ride.pickup)}</option>${ride.stops.map(s => `<option>${escapeHtml(s)}</option>`).join("")}</select></label><label>Luggage<select id="requestLuggage"><option>Small bag</option><option>One medium bag</option><option>No luggage</option></select></label><label>Short introduction<textarea id="requestMessage" maxlength="300" placeholder="Hi, I can join from ${escapeHtml(ride.pickup)}. I am travelling for work."></textarea></label><button class="primary-btn" data-request-ride="${ride.id}">Send seat request</button>`;
    }

    $("rideModalContent").innerHTML = `<div class="modal-content">
      <span class="modal-date">${longDate(ride.date).toUpperCase()} · ${ride.verified ? "IDENTITY VERIFIED" : "VERIFICATION PENDING"}</span>
      <div class="modal-route"><div class="route-time">${escapeHtml(ride.time)}</div><div class="route-track"><i class="track-dot"></i><i class="track-line"></i><i class="track-dot end"></i></div><div class="route-names"><div><strong>${escapeHtml(ride.origin)}</strong><span>${escapeHtml(ride.pickup)}</span></div><div><strong>${escapeHtml(ride.destination)}</strong><span>${escapeHtml(ride.dropoff)}</span></div></div></div>
      <div class="modal-summary"><div><span>TRAVEL TIME</span><strong>${escapeHtml(ride.duration)}</strong></div><div><span>SEATS LEFT</span><strong>${ride.seats}</strong></div><div><span>PER SEAT</span><strong>${money(ride.price)}</strong></div><div><span>TIME FLEXIBILITY</span><strong>${escapeHtml(ride.flexibility)}</strong></div></div>
      <div class="modal-grid">
        <div><div class="driver-card"><div class="driver-row">${avatarMarkup(ride.driver, ride.avatar)}<div><strong>${escapeHtml(ride.driver)}</strong><span>★ ${ride.rating ? ride.rating.toFixed(1) : "New"} · ${ride.completed} completed journeys</span></div></div><div class="detail-row"><span>Verified</span><strong>${verification.length ? verification.join(" · ") : "Verification pending"}</strong></div><div class="detail-row"><span>Vehicle</span><strong>${escapeHtml(ride.colour)} ${escapeHtml(ride.vehicle)}</strong></div><div class="detail-row"><span>Vehicle no.</span><strong>${escapeHtml(ride.plate)}</strong></div><div class="detail-row"><span>Stops</span><strong>${ride.stops.length ? ride.stops.map(escapeHtml).join(", ") : "Direct"}</strong></div><div class="detail-row"><span>Luggage</span><strong>${escapeHtml(ride.luggage)}</strong></div><div class="detail-row"><span>Preferences</span><strong>${ride.preferences.length ? ride.preferences.map(escapeHtml).join(", ") : "No special preference"}</strong></div></div><div class="safety-inline">Contact details and the full vehicle number are available only to accepted passengers.</div></div>
        <div class="request-box"><h3>${already ? "Request already sent" : `Request ${state.passengers} seat${state.passengers > 1 ? "s" : ""}`}</h3>${requestContent}</div>
      </div>
    </div>`;
    openModal("rideModal");
  }

  async function sendRideRequest(id) {
    const ride = state.rides.find(x => x.id === id);
    const message = $("requestMessage")?.value.trim();
    if (!message) { toast("Please add a short introduction."); return; }
    const button = document.querySelector(`[data-request-ride="${id}"]`);
    if (button) { button.disabled = true; button.textContent = "Sending…"; }
    const { data: requestId, error } = await client.rpc("create_seat_request", {
      p_ride_id: id,
      p_requested_seats: state.passengers,
      p_pickup_point: $("requestPickup").value,
      p_luggage: $("requestLuggage").value,
      p_message: message
    });
    if (error) {
      toast(error.message);
      if (button) { button.disabled = false; button.textContent = "Send seat request"; }
      return;
    }
    const { data: conversation } = await client.from("conversations").select("id").eq("request_id", requestId).single();
    if (conversation) await client.from("messages").insert({ conversation_id: conversation.id, sender_id: state.user.id, body: message });
    closeModal("rideModal");
    openModal("requestSuccessModal");
    await loadJourneys();
  }

  async function toggleSave(id) {
    requireAuth(async () => {
      if (state.saved.has(id)) {
        const { error } = await client.from("saved_rides").delete().eq("user_id", state.user.id).eq("ride_id", id);
        if (error) { toast(error.message); return; }
        state.saved.delete(id);
        toast("Removed from saved rides.");
      } else {
        const { error } = await client.from("saved_rides").insert({ user_id: state.user.id, ride_id: id });
        if (error) { toast(error.message); return; }
        state.saved.add(id);
        toast("Ride saved.");
      }
      renderRides();
    });
  }

  async function publishRide(form) {
    requireAuth(async () => {
      const d = Object.fromEntries(new FormData(form).entries());
      const plate = d.plate.trim();
      const vehiclePayload = {
        owner_id: state.user.id,
        model: d.vehicle.trim(),
        colour: d.colour.trim(),
        plate_number: plate,
        seats: Math.max(2, Number(d.seats) + 1),
        is_active: true
      };
      let vehicleId = null;
      const { data: existing } = await client.from("vehicles").select("id").eq("owner_id", state.user.id).eq("plate_number", plate).maybeSingle();
      if (existing) {
        vehicleId = existing.id;
        const vehicleUpdate = { model: vehiclePayload.model, colour: vehiclePayload.colour, plate_number: vehiclePayload.plate_number, seats: vehiclePayload.seats, is_active: true };
        const { error } = await client.from("vehicles").update(vehicleUpdate).eq("id", vehicleId);
        if (error) { toast(error.message); return; }
      } else {
        const { data: vehicle, error } = await client.from("vehicles").insert(vehiclePayload).select("id").single();
        if (error) { toast(error.message); return; }
        vehicleId = vehicle.id;
      }
      const ridePayload = {
        driver_id: state.user.id,
        vehicle_id: vehicleId,
        origin: d.origin.trim(),
        destination: d.destination.trim(),
        pickup_point: d.pickup.trim(),
        dropoff_point: d.dropoff.trim(),
        stops: d.stops ? d.stops.split(",").map(x => x.trim()).filter(Boolean) : [],
        departure_date: d.date,
        departure_time: d.time,
        duration_minutes: parseDuration(d.duration),
        flexibility_minutes: parseFlexibility(d.flexibility),
        total_seats: Number(d.seats),
        available_seats: Number(d.seats),
        price_per_seat: Number(d.price),
        luggage: d.luggage,
        approval_mode: d.approval === "Instant approval" ? "instant" : "review",
        vehicle_model: d.vehicle.trim(),
        vehicle_colour: d.colour.trim(),
        vehicle_plate_masked: maskPlate(plate),
        no_smoking: Boolean(d.noSmoking),
        music_ok: Boolean(d.music),
        women_preferred: Boolean(d.womenPreferred),
        pets_allowed: Boolean(d.pets)
      };
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true; submit.textContent = "Publishing…";
      const { error } = await client.from("rides").insert(ridePayload);
      submit.disabled = false; submit.textContent = "Publish ride";
      if (error) { toast(error.message); return; }
      form.reset();
      setOfferDefaults();
      toast("Your ride is live on the shared departure board.");
      state.journeyTab = "driver";
      setView("journeys");
      searchRides();
    }, "offer");
  }

  async function loadJourneys() {
    if (!state.user) return;
    $("journeyPanel").innerHTML = loadingHtml("Loading journeys", "Syncing driver and passenger activity.");
    const driverQuery = client.from("rides").select("*").eq("driver_id", state.user.id).order("departure_date", { ascending: false }).order("departure_time", { ascending: false });
    const passengerQuery = client.from("seat_requests").select(`*, ride:rides!seat_requests_ride_id_fkey(*, driver:profiles!rides_driver_id_fkey(*))`).eq("passenger_id", state.user.id).order("created_at", { ascending: false });
    const [{ data: driverRides, error: dError }, { data: passengerRequests, error: pError }] = await Promise.all([driverQuery, passengerQuery]);
    if (dError || pError) {
      $("journeyPanel").innerHTML = `<div class="empty-state"><strong>Could not load journeys.</strong><br>${escapeHtml((dError || pError).message)}</div>`;
      return;
    }
    state.driverRides = driverRides || [];
    state.passengerRequests = passengerRequests || [];
    const rideIds = state.driverRides.map(r => r.id);
    if (rideIds.length) {
      const { data, error } = await client.from("seat_requests").select(`*, passenger:profiles!seat_requests_passenger_id_fkey(*)`).in("ride_id", rideIds).order("created_at", { ascending: false });
      state.incomingRequests = error ? [] : (data || []);
    } else state.incomingRequests = [];
    renderJourneys();
  }

  function requestCard(q) {
    const p = q.passenger || {};
    return `<div class="request-card"><button class="driver-avatar ${p.avatar_url ? "has-photo" : ""}" data-passenger="${q.id}">${p.avatar_url ? `<img src="${escapeHtml(p.avatar_url)}" alt="${escapeHtml(p.full_name || "Passenger")}" />` : initials(p.full_name)}</button><div><strong>${escapeHtml(p.full_name || "Passenger")} · ${p.average_rating ? `★ ${Number(p.average_rating).toFixed(1)}` : "New member"}</strong><span>${q.requested_seats} seat${q.requested_seats > 1 ? "s" : ""} · ${escapeHtml(q.pickup_point)} · ${escapeHtml(q.luggage)}</span><span>${escapeHtml(q.message)}</span></div><div class="request-actions">${q.status === "requested" ? `<button class="accept" data-request-action="${q.id}|accept">Accept</button><button class="message" data-request-action="${q.id}|message">Ask</button><button class="decline" data-request-action="${q.id}|decline">Decline</button>` : `<span class="status-badge ${q.status}">${statusLabel(q.status)}</span>${q.status === "accepted" ? `<button class="message" data-request-action="${q.id}|message">Message</button><button class="message" data-confirmed-details="${q.id}">Details</button>` : ""}`}</div></div>`;
  }

  function driverRideCard(row) {
    const r = normalizeRide({ ...row, driver: state.profile || {} });
    const incoming = state.incomingRequests.filter(q => q.ride_id === r.id && !["declined", "cancelled"].includes(q.status));
    const nextAction = ["published", "full"].includes(r.status) ? "departing" : r.status === "departing" ? "in_progress" : r.status === "in_progress" ? "completed" : null;
    return `<article class="journey-card"><div class="journey-card-head"><div><h3>${escapeHtml(r.origin)} → ${escapeHtml(r.destination)}</h3><p>${prettyDate(r.date)} · ${escapeHtml(r.time)} · ${escapeHtml(r.vehicle)}</p></div><span class="status-badge ${r.status}">${statusLabel(r.status)}</span></div><div class="journey-details"><div><span>PICKUP</span><strong>${escapeHtml(r.pickup)}</strong></div><div><span>EMPTY SEATS</span><strong>${r.seats}</strong></div><div><span>CONTRIBUTION</span><strong>${money(r.price)}</strong></div><div><span>REQUESTS</span><strong>${incoming.filter(x => x.status === "requested").length}</strong></div></div><div class="journey-actions">${nextAction ? `<button class="small-action primary" data-ride-status="${r.id}|${nextAction}">${nextAction === "departing" ? "Mark departing soon" : nextAction === "in_progress" ? "Start journey" : "Complete journey"}</button>` : ""}<button class="small-action" data-open-ride="${r.id}">View ride</button>${!["completed", "cancelled"].includes(r.status) ? `<button class="small-action danger" data-ride-status="${r.id}|cancelled">Cancel</button>` : ""}</div>${incoming.length ? `<div class="request-section"><h4>Passenger requests</h4>${incoming.map(requestCard).join("")}</div>` : ""}</article>`;
  }

  function passengerJourneyCard(q) {
    const r = q.ride ? normalizeRide(q.ride) : null;
    return `<article class="journey-card"><div class="journey-card-head"><div><h3>${r ? `${escapeHtml(r.origin)} → ${escapeHtml(r.destination)}` : "Ride unavailable"}</h3><p>${r ? `${prettyDate(r.date)} · ${escapeHtml(r.time)} · Driver: ${escapeHtml(r.driver)}` : "The ride may have been removed."}</p></div><span class="status-badge ${q.status}">${statusLabel(q.status)}</span></div><div class="journey-details"><div><span>PICKUP</span><strong>${escapeHtml(q.pickup_point)}</strong></div><div><span>SEATS</span><strong>${q.requested_seats}</strong></div><div><span>LUGGAGE</span><strong>${escapeHtml(q.luggage)}</strong></div><div><span>VEHICLE</span><strong>${r ? escapeHtml(r.vehicle) : "—"}</strong></div></div><div class="journey-actions">${q.status === "accepted" ? `<button class="small-action primary" data-request-message="${q.id}">Message driver</button><button class="small-action" data-confirmed-details="${q.id}">Confirmed details</button>` : ""}${r ? `<button class="small-action" data-open-ride="${r.id}">View ride</button>` : ""}${!["completed", "cancelled", "declined"].includes(q.status) ? `<button class="small-action danger" data-cancel-request="${q.id}">Cancel request</button>` : ""}</div></article>`;
  }

  function renderJourneys() {
    const activeDriver = state.driverRides.filter(r => !["completed", "cancelled"].includes(r.status));
    const activePassenger = state.passengerRequests.filter(q => !["completed", "cancelled", "declined"].includes(q.status));
    const history = [...state.driverRides.filter(r => ["completed", "cancelled"].includes(r.status)), ...state.passengerRequests.filter(q => ["completed", "cancelled", "declined"].includes(q.status))];
    $("driverRideCount").textContent = activeDriver.length;
    $("passengerRequestCount").textContent = activePassenger.length;
    $("historyCount").textContent = history.length;
    all("[data-journey-tab]").forEach(b => b.classList.toggle("active", b.dataset.journeyTab === state.journeyTab));
    if (state.journeyTab === "driver") {
      $("journeyPanel").innerHTML = activeDriver.length ? activeDriver.map(driverRideCard).join("") : `<div class="empty-state"><strong>No active driver journey.</strong><br>Offer seats when you are travelling.</div>`;
    } else if (state.journeyTab === "passenger") {
      $("journeyPanel").innerHTML = activePassenger.length ? activePassenger.map(passengerJourneyCard).join("") : `<div class="empty-state"><strong>No active seat request.</strong><br>Search for a route and request a seat.</div>`;
    } else {
      const cards = [];
      state.driverRides.filter(r => ["completed", "cancelled"].includes(r.status)).forEach(r => cards.push(`<article class="journey-card"><div class="journey-card-head"><div><h3>${escapeHtml(r.origin)} → ${escapeHtml(r.destination)}</h3><p>As driver · ${prettyDate(r.departure_date)}</p></div><span class="status-badge ${r.status}">${statusLabel(r.status)}</span></div></article>`));
      state.passengerRequests.filter(q => ["completed", "cancelled", "declined"].includes(q.status)).forEach(q => { const r = q.ride ? normalizeRide(q.ride) : null; cards.push(`<article class="journey-card"><div class="journey-card-head"><div><h3>${r ? `${escapeHtml(r.origin)} → ${escapeHtml(r.destination)}` : "Past request"}</h3><p>As passenger · ${r ? prettyDate(r.date) : "—"}</p></div><span class="status-badge ${q.status}">${statusLabel(q.status)}</span></div></article>`); });
      $("journeyPanel").innerHTML = cards.length ? cards.join("") : `<div class="empty-state">No journey history yet.</div>`;
    }
  }

  async function respondRequest(id, action) {
    if (action === "message") {
      await loadConversations();
      const conv = state.conversations.find(c => c.request_id === id);
      if (conv) { state.activeConversation = conv.id; setView("inbox"); }
      return;
    }
    const { error } = await client.rpc("respond_to_seat_request", { p_request_id: id, p_action: action });
    if (error) { toast(error.message); return; }
    toast(action === "accept" ? "Passenger accepted. Seats updated safely." : "Request declined.");
    await Promise.all([loadJourneys(), loadNotifications(), searchRides()]);
  }

  async function changeRideStatus(id, status) {
    const { error } = await client.rpc("update_ride_status", { p_ride_id: id, p_new_status: status });
    if (error) { toast(error.message); return; }
    toast(status === "completed" ? "Journey completed." : status === "cancelled" ? "Journey cancelled." : `Ride marked ${statusLabel(status)}.`);
    await Promise.all([loadJourneys(), loadProfile(), searchRides()]);
  }

  async function cancelSeatRequest(id) {
    const { error } = await client.rpc("cancel_seat_request", { p_request_id: id });
    if (error) { toast(error.message); return; }
    toast("Seat request cancelled.");
    await Promise.all([loadJourneys(), searchRides()]);
  }

  async function showConfirmedDetails(requestId) {
    const { data, error } = await client.rpc("get_accepted_request_details", { p_request_id: requestId });
    if (error) { toast(error.message); return; }
    const d = data?.[0];
    if (!d) { toast("Confirmed details are not available yet."); return; }
    const isDriver = state.user.id !== state.passengerRequests.find(q => q.id === requestId)?.passenger_id;
    const contactName = isDriver ? d.passenger_name : d.driver_name;
    const contactPhone = isDriver ? d.passenger_phone : d.driver_phone;
    $("genericModalContent").innerHTML = `<div class="generic-modal-content"><h2>Confirmed journey details</h2><p>These details are private to the accepted driver and passenger.</p><div class="detail-list"><article><strong>Contact</strong><span>${escapeHtml(contactName || "Sangai member")} · ${escapeHtml(contactPhone || "Phone not added")}</span></article><article><strong>Vehicle</strong><span>${escapeHtml([d.vehicle_colour, d.vehicle_model].filter(Boolean).join(" ") || "Vehicle not added")} · ${escapeHtml(d.vehicle_plate_number || "Plate not added")}</span></article><article><strong>Pickup and drop-off</strong><span>${escapeHtml(d.pickup_point)} → ${escapeHtml(d.dropoff_point)}</span></article><article><strong>Departure</strong><span>${prettyDate(d.departure_date)} · ${timeShort(d.departure_time)}</span></article></div><div class="generic-modal-actions"><button class="primary-btn full-btn" data-close="genericModal">Done</button></div></div>`;
    openModal("genericModal");
  }

  function openPassenger(id) {
    const q = state.incomingRequests.find(x => x.id === id);
    if (!q) return;
    const p = q.passenger || {};
    const verified = [p.phone_verified ? "Phone" : null, p.identity_verified ? "Identity" : null].filter(Boolean);
    $("passengerModalContent").innerHTML = `<div class="passenger-profile">${avatarMarkup(p.full_name, p.avatar_url, "profile-avatar")}<h2>${escapeHtml(p.full_name || "Passenger")}</h2><span class="verified-label">${verified.length ? `✓ ${verified.join(" · ")}` : "Verification pending"}</span><p>${escapeHtml(q.message)}</p><div class="passenger-stats"><div><strong>${p.average_rating ? Number(p.average_rating).toFixed(1) : "New"}</strong><span>RATING</span></div><div><strong>${p.completed_rides || 0}</strong><span>JOURNEYS</span></div><div><strong>${p.city || "Nepal"}</strong><span>CITY</span></div></div>${q.status === "requested" ? `<button class="primary-btn full-btn" data-request-action="${q.id}|accept">Accept request</button>` : ""}</div>`;
    openModal("passengerModal");
  }

  async function loadConversations() {
    if (!state.user) return;
    $("conversationList").innerHTML = loadingHtml("Loading messages", "Connecting private conversations.");
    $("chatPanel").innerHTML = `<div class="conversation-empty"><div><strong>Select a conversation</strong>Messages are private to the driver and passenger.</div></div>`;
    const { data, error } = await client.from("conversations").select(`*, ride:rides!conversations_ride_id_fkey(id,origin,destination,departure_date,departure_time), driver:profiles!conversations_driver_id_fkey(*), passenger:profiles!conversations_passenger_id_fkey(*)`).order("created_at", { ascending: false });
    if (error) {
      $("conversationList").innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
      return;
    }
    const conversations = data || [];
    if (!conversations.length) {
      state.conversations = [];
      renderInbox();
      return;
    }
    const ids = conversations.map(c => c.id);
    const { data: messages } = await client.from("messages").select("*").in("conversation_id", ids).order("created_at", { ascending: true });
    const grouped = new Map();
    (messages || []).forEach(m => { if (!grouped.has(m.conversation_id)) grouped.set(m.conversation_id, []); grouped.get(m.conversation_id).push(m); });
    state.conversations = conversations.map(c => ({ ...c, messages: grouped.get(c.id) || [] }));
    if (!state.activeConversation || !state.conversations.some(c => c.id === state.activeConversation)) state.activeConversation = state.conversations[0]?.id || null;
    renderInbox();
  }

  function otherPerson(c) {
    return c.driver_id === state.user.id ? c.passenger : c.driver;
  }

  function renderInbox() {
    if (!state.conversations.length) {
      $("conversationList").innerHTML = `<div class="empty-state">No conversations yet.</div>`;
      $("chatPanel").innerHTML = `<div class="conversation-empty"><div><strong>No private messages</strong>A conversation opens when a passenger requests a ride.</div></div>`;
      updateMessageBadge();
      return;
    }
    $("conversationList").innerHTML = state.conversations.map(c => {
      const person = otherPerson(c) || {};
      const last = c.messages.at(-1);
      const unread = c.messages.filter(m => m.sender_id !== state.user.id && !m.read_at).length;
      return `<button class="conversation-item ${c.id === state.activeConversation ? "active" : ""}" data-conversation="${c.id}">${avatarMarkup(person.full_name, person.avatar_url)}<span><strong>${escapeHtml(person.full_name || "Sangai member")}</strong><span>${escapeHtml(last?.body || `${c.ride.origin} → ${c.ride.destination}`)}</span></span><span><time>${last ? new Date(last.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</time>${unread ? `<i class="unread-dot"></i>` : ""}</span></button>`;
    }).join("");
    const c = state.conversations.find(x => x.id === state.activeConversation);
    if (!c) return;
    const person = otherPerson(c) || {};
    state.activeMessages = c.messages;
    $("chatPanel").innerHTML = `<div class="chat-header"><div class="chat-person">${avatarMarkup(person.full_name, person.avatar_url)}<div><strong>${escapeHtml(person.full_name || "Sangai member")}</strong><span>Private conversation</span></div></div><span class="chat-ride">${escapeHtml(c.ride.origin)} → ${escapeHtml(c.ride.destination)}</span></div><div class="message-stream" id="messageStream">${c.messages.map(m => `<div class="message ${m.sender_id === state.user.id ? "mine" : ""}">${escapeHtml(m.body)}<small>${new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></div>`).join("")}</div><form class="chat-compose" id="chatForm"><input id="chatInput" maxlength="500" placeholder="Write a message…" autocomplete="off"/><button aria-label="Send"><svg viewBox="0 0 24 24"><path d="m3 11 18-8-8 18-2-8-8-2Z"/><path d="m11 13 5-5"/></svg></button></form>`;
    $("chatForm").addEventListener("submit", sendMessage);
    client.rpc("mark_conversation_read", { p_conversation_id: c.id }).then(() => { c.messages.forEach(m => { if (m.sender_id !== state.user.id) m.read_at = new Date().toISOString(); }); updateMessageBadge(); });
    setTimeout(() => { const stream = $("messageStream"); if (stream) stream.scrollTop = stream.scrollHeight; }, 0);
    updateMessageBadge();
  }

  async function sendMessage(event) {
    event.preventDefault();
    const body = $("chatInput").value.trim();
    if (!body || !state.activeConversation) return;
    $("chatInput").value = "";
    const { error } = await client.from("messages").insert({ conversation_id: state.activeConversation, sender_id: state.user.id, body });
    if (error) { toast(error.message); return; }
    await loadConversations();
  }

  function updateMessageBadge() {
    const count = state.conversations.reduce((total, c) => total + c.messages.filter(m => m.sender_id !== state.user?.id && !m.read_at).length, 0);
    $("messageBadge").textContent = count;
    $("messageBadge").classList.toggle("hidden", count === 0);
  }

  function verificationItems() {
    const p = state.profile || {};
    return [
      { key: "phone_verified", title: "Phone number", subtitle: "Reviewed manually by Sangai", done: p.phone_verified },
      { key: "identity_verified", title: "Government identity", subtitle: "Citizenship or passport", done: p.identity_verified },
      { key: "licence_verified", title: "Driving licence", subtitle: "Required for a verified driver", done: p.licence_verified },
      { key: "vehicle_verified", title: "Vehicle bluebook", subtitle: "Required for a verified vehicle", done: p.vehicle_verified }
    ];
  }

  function renderVerification() {
    const items = verificationItems();
    const completed = items.filter(i => i.done).length;
    const percent = Math.round(completed / items.length * 100);
    const html = items.map(i => `<div class="verification-item ${i.done ? "" : "pending"}"><span class="check-icon">${i.done ? "✓" : "○"}</span><div><strong>${escapeHtml(i.title)}</strong><span>${escapeHtml(i.subtitle)}</span></div>${i.done ? `<span class="verified-label">Verified</span>` : `<span class="status-badge requested">Pending review</span>`}</div>`).join("");
    if ($("verificationList")) $("verificationList").innerHTML = html;
    if ($("safetyVerificationList")) $("safetyVerificationList").innerHTML = html;
    if ($("verificationPercent")) $("verificationPercent").textContent = `${percent}%`;
    if ($("safetyPercent")) $("safetyPercent").textContent = `${percent}%`;
    if ($("verificationBar")) $("verificationBar").style.width = `${percent}%`;
  }

  async function loadReviews() {
    if (!state.user || !$("profileReviewList")) return;
    const { data } = await client.from("reviews").select(`*, reviewer:profiles!reviews_reviewer_id_fkey(full_name,avatar_url)`).eq("reviewed_user_id", state.user.id).order("created_at", { ascending: false }).limit(10);
    $("profileReviewList").innerHTML = data?.length ? data.map(r => `<article>${avatarMarkup(r.reviewer?.full_name, r.reviewer?.avatar_url, "review-avatar")}<div><strong>${escapeHtml(r.reviewer?.full_name || "Sangai member")}</strong><small>Completed journey</small><p>${escapeHtml(r.comment || "No written comment")}</p></div><b>★ ${r.rating}.0</b></article>`).join("") : `<div class="empty-state">Reviews appear after completed journeys.</div>`;
  }

  function renderProfile() {
    if (!state.profile) return;
    const p = state.profile;
    $("profileAvatar").innerHTML = p.avatar_url ? `<img src="${escapeHtml(p.avatar_url)}" alt="${escapeHtml(p.full_name)}" />` : initials(p.full_name);
    $("profileAvatar").classList.toggle("has-photo", Boolean(p.avatar_url));
    $("profileName").textContent = p.full_name;
    $("profileMeta").textContent = `${p.city || "Nepal"} · Member since ${new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date(p.created_at))}`;
    if ($("profileBio")) $("profileBio").textContent = p.bio || "Add a short public introduction so people know who they are travelling with.";
    $("profileRating").textContent = p.average_rating ? Number(p.average_rating).toFixed(1) : "New";
    $("profileStats").textContent = `★ · ${p.completed_rides || 0} completed journeys`;
    $("profileVerifiedBadge").classList.toggle("hidden", !p.identity_verified);
    $("profilePreferences").innerHTML = (p.travel_preferences || ["No smoking", "Music is okay"]).map(x => `<span>${escapeHtml(x)}</span>`).join("");
    const privateP = state.privateProfile || {};
    $("trustedContactCard").innerHTML = privateP.emergency_contact_name ? `<span class="review-avatar">${initials(privateP.emergency_contact_name)}</span><div><strong>${escapeHtml(privateP.emergency_contact_name)}</strong><small>${escapeHtml(privateP.emergency_contact_phone || "Number not added")}</small></div><span class="verified-label">Active</span>` : `<span class="review-avatar">?</span><div><strong>No trusted contact</strong><small>Add one before your first ride.</small></div>`;
    renderVerification();
    loadReviews();
    const overview = document.querySelector(".profile-overview-card");
    let actions = overview?.querySelector(".profile-actions");
    if (!actions && overview) {
      actions = document.createElement("div"); actions.className = "profile-actions";
      const edit = $("editProfileBtn"); overview.appendChild(actions); actions.appendChild(edit);
      const signout = document.createElement("button"); signout.className = "signout-btn"; signout.id = "signOutBtn"; signout.textContent = "Log out"; actions.appendChild(signout);
      signout.addEventListener("click", signOut);
    }
  }

  function openProfileEditor() {
    const p = state.profile || {};
    const pp = state.privateProfile || {};
    $("genericModalContent").innerHTML = `<div class="generic-modal-content"><h2>Edit profile</h2><p>Use your real information so drivers and passengers know who they are meeting.</p><form class="auth-form" id="profileEditForm"><label>Profile photo<input name="avatar_file" type="file" accept="image/jpeg,image/png,image/webp" /><small class="field-help">JPG, PNG or WebP · maximum 2 MB</small></label><label>Full name<input name="full_name" value="${escapeHtml(p.full_name || "")}" required /></label><label>City<input name="city" list="nepalPlaces" value="${escapeHtml(p.city || "")}" /></label><label>Phone<input name="phone" value="${escapeHtml(pp.phone || "")}" placeholder="+977 98…" /></label><label>Short bio<input name="bio" value="${escapeHtml(p.bio || "")}" maxlength="180" placeholder="A short public introduction" /></label><label>Trusted contact name<input name="emergency_contact_name" value="${escapeHtml(pp.emergency_contact_name || "")}" /></label><label>Trusted contact phone<input name="emergency_contact_phone" value="${escapeHtml(pp.emergency_contact_phone || "")}" /></label><button class="primary-btn full-btn" type="submit">Save profile</button></form></div>`;
    openModal("genericModal");
    $("profileEditForm").addEventListener("submit", saveProfile);
  }

  async function saveProfile(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const d = Object.fromEntries(formData.entries());
    let avatarUrl = state.profile?.avatar_url || null;
    const avatarFile = formData.get("avatar_file");
    if (avatarFile && avatarFile.size) {
      if (avatarFile.size > 2 * 1024 * 1024) { toast("Profile photo must be under 2 MB."); return; }
      const ext = (avatarFile.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${state.user.id}/avatar.${ext}`;
      const { error: uploadError } = await client.storage.from("avatars").upload(path, avatarFile, { upsert: true, contentType: avatarFile.type });
      if (uploadError) { toast(uploadError.message); return; }
      avatarUrl = client.storage.from("avatars").getPublicUrl(path).data.publicUrl + `?v=${Date.now()}`;
    }
    const [{ error: pError }, { error: ppError }] = await Promise.all([
      client.from("profiles").update({ full_name: d.full_name.trim(), city: d.city.trim() || null, bio: d.bio.trim() || null, avatar_url: avatarUrl }).eq("id", state.user.id),
      client.from("private_profiles").update({ phone: d.phone.trim() || null, emergency_contact_name: d.emergency_contact_name.trim() || null, emergency_contact_phone: d.emergency_contact_phone.trim() || null }).eq("user_id", state.user.id)
    ]);
    if (pError || ppError) { toast((pError || ppError).message); return; }
    closeModal("genericModal");
    toast("Profile updated.");
    await loadProfile();
  }

  function genericInfo(title, body, action = "Done") {
    $("genericModalContent").innerHTML = `<div class="generic-modal-content"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(body)}</p><div class="generic-modal-actions"><button class="primary-btn full-btn" data-close="genericModal">${escapeHtml(action)}</button></div></div>`;
    openModal("genericModal");
  }

  function openAuth(mode = "login") {
    if (!configured) { showSetupMessage(); return; }
    state.authMode = mode;
    all("[data-auth-tab]").forEach(b => b.classList.toggle("active", b.dataset.authTab === mode));
    all(".signup-only").forEach(x => x.classList.toggle("hidden", mode !== "signup"));
    $("authTitle").textContent = mode === "signup" ? "Create your account" : "Welcome back";
    $("authSubtitle").textContent = mode === "signup" ? "Join Sangai to offer seats and request real journeys." : "Log in to offer seats, request rides and message privately.";
    $("authSubmit").textContent = mode === "signup" ? "Create account" : "Log in";
    $("authMessage").textContent = "";
    openModal("authModal");
  }

  async function handleAuth(event) {
    event.preventDefault();
    const email = $("authEmail").value.trim();
    const password = $("authPassword").value;
    const submit = $("authSubmit");
    submit.disabled = true; submit.textContent = state.authMode === "signup" ? "Creating…" : "Logging in…";
    let result;
    if (state.authMode === "signup") {
      const fullName = $("authFullName").value.trim();
      if (!fullName) { $("authMessage").textContent = "Please enter your full name."; submit.disabled = false; submit.textContent = "Create account"; return; }
      result = await client.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin, data: { full_name: fullName, city: $("authCity").value.trim() } } });
    } else result = await client.auth.signInWithPassword({ email, password });
    submit.disabled = false; submit.textContent = state.authMode === "signup" ? "Create account" : "Log in";
    if (result.error) { $("authMessage").textContent = result.error.message; return; }
    if (state.authMode === "signup" && !result.data.session) {
      $("authMessage").textContent = "Account created. Check your email to confirm it, then log in.";
      return;
    }
    closeModal("authModal");
  }

  async function forgotPassword() {
    const email = $("authEmail").value.trim();
    if (!email) { $("authMessage").textContent = "Enter your email first."; return; }
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    $("authMessage").textContent = error ? error.message : "Password reset link sent. Check your email.";
  }

  function openPasswordRecovery() {
    $("genericModalContent").innerHTML = `<div class="generic-modal-content"><h2>Choose a new password</h2><form class="auth-form" id="passwordRecoveryForm"><label>New password<input name="password" type="password" minlength="6" required /></label><button class="primary-btn full-btn" type="submit">Update password</button></form></div>`;
    openModal("genericModal");
    $("passwordRecoveryForm").addEventListener("submit", async e => {
      e.preventDefault();
      const password = new FormData(e.currentTarget).get("password");
      const { error } = await client.auth.updateUser({ password });
      if (error) { toast(error.message); return; }
      closeModal("genericModal"); toast("Password updated.");
    });
  }

  async function signOut() {
    await client.auth.signOut();
    setView("home");
    toast("Logged out.");
  }

  function setOfferDefaults() {
    const input = document.querySelector('#offerForm input[name="date"]');
    if (input) { input.min = futureDate(0); input.value = futureDate(1); }
  }

  function clearChannels() {
    state.channels.forEach(ch => client?.removeChannel(ch));
    state.channels = [];
  }

  function subscribeRealtime() {
    if (!client || !state.user) return;
    clearChannels();
    const channel = client.channel(`sangai-user-${state.user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "seat_requests" }, () => loadJourneys())
      .on("postgres_changes", { event: "*", schema: "public", table: "rides" }, () => { searchRides(); loadJourneys(); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => loadConversations())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, () => loadNotifications())
      .subscribe();
    state.channels.push(channel);
  }

  async function handleSession(session) {
    state.session = session;
    state.user = session?.user || null;
    if (!state.user) {
      state.profile = null;
      state.privateProfile = null;
      state.saved.clear();
      state.driverRides = [];
      state.passengerRequests = [];
      state.incomingRequests = [];
      state.conversations = [];
      clearChannels();
      updateAuthUI();
      renderRides();
      return;
    }
    await Promise.all([loadProfile(), loadSaved(), loadNotifications()]);
    subscribeRealtime();
    updateAuthUI();
    if (state.pendingAction) { const action = state.pendingAction; state.pendingAction = null; await action(); }
    if (state.pendingView) { const view = state.pendingView; state.pendingView = null; setView(view); }
  }

  function bindEvents() {
    all("[data-view]").forEach(n => n.addEventListener("click", e => { e.preventDefault(); closeModal("rideModal"); setView(n.dataset.view); }));
    all("[data-close]").forEach(n => n.addEventListener("click", () => closeModal(n.dataset.close)));
    all(".modal-backdrop").forEach(n => n.addEventListener("click", e => { if (e.target === n) closeModal(n.id); }));
    $("closePrototypeStrip")?.addEventListener("click", e => e.currentTarget.parentElement.remove());
    $("authButton").addEventListener("click", () => openAuth("login"));
    $("swapRoute").addEventListener("click", () => { const x = $("fromInput").value; $("fromInput").value = $("toInput").value; $("toInput").value = x; searchRides(); });
    $("searchRides").addEventListener("click", () => searchRides({ scroll: true }));
    $("sortSelect").addEventListener("change", renderRides);
    $("seatMinus").addEventListener("click", () => { state.passengers = Math.max(1, state.passengers - 1); $("seatCount").textContent = state.passengers; searchRides(); });
    $("seatPlus").addEventListener("click", () => { state.passengers = Math.min(4, state.passengers + 1); $("seatCount").textContent = state.passengers; searchRides(); });
    $("dateInput").addEventListener("change", () => { all("[data-date]").forEach(x => x.classList.remove("active")); searchRides(); });
    all("[data-date]").forEach(btn => btn.addEventListener("click", () => { all("[data-date]").forEach(x => x.classList.toggle("active", x === btn)); $("dateInput").value = btn.dataset.date === "today" ? futureDate(0) : futureDate(1); searchRides(); }));
    all("[data-filter]").forEach(btn => btn.addEventListener("click", () => { state.filter = btn.dataset.filter; all("[data-filter]").forEach(x => x.classList.toggle("active", x === btn)); renderRides(); }));
    all("[data-route]").forEach(btn => btn.addEventListener("click", () => { const [from, to] = btn.dataset.route.split("|"); $("fromInput").value = from; $("toInput").value = to; searchRides({ scroll: true }); }));
    $("offerForm").addEventListener("submit", e => { e.preventDefault(); publishRide(e.currentTarget); });
    $("journeyTabs").addEventListener("click", e => { const tab = e.target.closest("[data-journey-tab]"); if (!tab) return; state.journeyTab = tab.dataset.journeyTab; renderJourneys(); });
    $("authForm").addEventListener("submit", handleAuth);
    all("[data-auth-tab]").forEach(btn => btn.addEventListener("click", () => openAuth(btn.dataset.authTab)));
    $("forgotPasswordBtn").addEventListener("click", forgotPassword);
    $("editProfileBtn").addEventListener("click", openProfileEditor);
    $("editPreferencesBtn").addEventListener("click", () => genericInfo("Travel preferences", "Journey-specific preferences are selected when offering a ride. Public profile preferences remain visible to people reviewing your account."));
    $("changeContactBtn").addEventListener("click", openProfileEditor);
    $("shareJourneyBtn").addEventListener("click", () => genericInfo("Share active journey", "Once a seat is accepted, Sangai keeps the route, driver and vehicle details together so you can share them with a trusted contact."));
    $("reportIssueBtn").addEventListener("click", () => genericInfo("Safety reporting", "Use the Safety Centre to keep journey records and trusted-contact details together. For an urgent emergency, contact local emergency services first."));
    $("languageBtn")?.addEventListener("click", () => toast("Language selection is not enabled yet."));

    document.addEventListener("click", async e => {
      const close = e.target.closest("[data-close]"); if (close) { closeModal(close.dataset.close); return; }
      const dynamicView = e.target.closest("[data-view]"); if (dynamicView && !dynamicView.closest(".desktop-nav") && !dynamicView.closest(".mobile-nav") && !dynamicView.classList.contains("brand") && !dynamicView.classList.contains("avatar-btn") && !dynamicView.classList.contains("notification-btn") && !dynamicView.classList.contains("driver-shortcut") && !dynamicView.closest(".page-heading")) { closeModal("rideModal"); setView(dynamicView.dataset.view); return; }
      const open = e.target.closest("[data-open-ride]"); if (open) { openRide(open.dataset.openRide); return; }
      const save = e.target.closest("[data-save]"); if (save) { toggleSave(save.dataset.save); return; }
      const request = e.target.closest("[data-request-ride]"); if (request) { sendRideRequest(request.dataset.requestRide); return; }
      const loginRequest = e.target.closest("[data-login-request]"); if (loginRequest) { const rideId = loginRequest.dataset.loginRequest; closeModal("rideModal"); requireAuth(() => openRide(rideId)); return; }
      const viewRequest = e.target.closest("[data-view-request], [data-success-journey]"); if (viewRequest) { closeModal("requestSuccessModal"); closeModal("rideModal"); state.journeyTab = "passenger"; setView("journeys"); return; }
      const action = e.target.closest("[data-request-action]"); if (action) { const [id, type] = action.dataset.requestAction.split("|"); closeModal("passengerModal"); respondRequest(id, type); return; }
      const passenger = e.target.closest("[data-passenger]"); if (passenger) { openPassenger(passenger.dataset.passenger); return; }
      const rideStatus = e.target.closest("[data-ride-status]"); if (rideStatus) { const [id, status] = rideStatus.dataset.rideStatus.split("|"); changeRideStatus(id, status); return; }
      const cancel = e.target.closest("[data-cancel-request]"); if (cancel) { cancelSeatRequest(cancel.dataset.cancelRequest); return; }
      const confirmed = e.target.closest("[data-confirmed-details]"); if (confirmed) { showConfirmedDetails(confirmed.dataset.confirmedDetails); return; }
      const requestMessage = e.target.closest("[data-request-message]"); if (requestMessage) { await loadConversations(); const c = state.conversations.find(x => x.request_id === requestMessage.dataset.requestMessage); if (c) { state.activeConversation = c.id; setView("inbox"); } return; }
      const conversation = e.target.closest("[data-conversation]"); if (conversation) { state.activeConversation = conversation.dataset.conversation; renderInbox(); return; }
    });
  }

  async function init() {
    $("dateInput").min = futureDate(0);
    $("dateInput").value = futureDate(1);
    setOfferDefaults();
    bindEvents();
    updateConnectionUI();
    if (!configured) return;

    const { data: { session } } = await client.auth.getSession();
    await handleSession(session);
    client.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") setTimeout(openPasswordRecovery, 0);
      setTimeout(() => handleSession(nextSession), 0);
    });
    await searchRides();
  }

  init().catch(error => {
    console.error(error);
    toast("Sangai could not finish loading. Please refresh and try again.");
  });
})();
