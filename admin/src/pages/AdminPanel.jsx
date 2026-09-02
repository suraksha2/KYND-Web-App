import { useState, useEffect } from "react";
import { LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth, API_BASE } from "../context/AuthContext";
import { iconForService } from "../lib/serviceIcon";

export default function AdminPanel() {
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [services, setServices] = useState([]);
  const [clients, setClients] = useState([]);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState({});
  const [error, setError] = useState({});
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showAddProviderModal, setShowAddProviderModal] = useState(false);
  const [newProvider, setNewProvider] = useState({
    name: '',
    email: '',
    mobile: '',
    services: [],
    city: '',
    status: 'active',
    password: ''
  });
  const [availableServices, setAvailableServices] = useState([]);
  const [availableCities, setAvailableCities] = useState([]);
  const [sortField, setSortField] = useState('date');
  const [sortDirection, setSortDirection] = useState('desc');

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "orders", label: "All Orders" },
    { id: "services", label: "Services" },
    { id: "clients", label: "Clients" },
    { id: "providers", label: "Providers" },
  ];

  // Attach the admin session token so the backend RBAC middleware authorizes
  // these cross-origin requests.
  const authFetch = (url, options = {}) =>
    fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

  // Fetch dashboard stats
  useEffect(() => {
    const fetchStats = async () => {
      setLoading(prev => ({ ...prev, stats: true }));
      setError(prev => ({ ...prev, stats: null }));
      try {
        const response = await authFetch(`${API_BASE}/dashboard/stats`);
        const data = await response.json();
        if (response.ok) {
          setStats(data.data);
        } else {
          setError(prev => ({ ...prev, stats: data.error || "Failed to fetch stats" }));
        }
      } catch (err) {
        setError(prev => ({ ...prev, stats: "Failed to connect to server" }));
      } finally {
        setLoading(prev => ({ ...prev, stats: false }));
      }
    };
    fetchStats();
  }, []);

  // Fetch orders
  useEffect(() => {
    const fetchOrders = async () => {
      setLoading(prev => ({ ...prev, orders: true }));
      setError(prev => ({ ...prev, orders: null }));
      try {
        const response = await authFetch(`${API_BASE}/orders`);
        const data = await response.json();
        if (response.ok) {
          setOrders(data.data || []);
        } else {
          setError(prev => ({ ...prev, orders: data.error || "Failed to fetch orders" }));
        }
      } catch (err) {
        setError(prev => ({ ...prev, orders: "Failed to connect to server" }));
      } finally {
        setLoading(prev => ({ ...prev, orders: false }));
      }
    };
    fetchOrders();
  }, []);

  // Fetch services
  useEffect(() => {
    const fetchServices = async () => {
      setLoading(prev => ({ ...prev, services: true }));
      setError(prev => ({ ...prev, services: null }));
      try {
        const response = await authFetch(`${API_BASE}/services`);
        const data = await response.json();
        if (response.ok) {
          setServices(data.data || []);
        } else {
          setError(prev => ({ ...prev, services: data.error || "Failed to fetch services" }));
        }
      } catch (err) {
        setError(prev => ({ ...prev, services: "Failed to connect to server" }));
      } finally {
        setLoading(prev => ({ ...prev, services: false }));
      }
    };
    fetchServices();
  }, []);

  // Fetch clients
  useEffect(() => {
    const fetchClients = async () => {
      setLoading(prev => ({ ...prev, clients: true }));
      setError(prev => ({ ...prev, clients: null }));
      try {
        const response = await authFetch(`${API_BASE}/clients`);
        const data = await response.json();
        if (response.ok) {
          setClients(data.data || []);
        } else {
          setError(prev => ({ ...prev, clients: data.error || "Failed to fetch clients" }));
        }
      } catch (err) {
        setError(prev => ({ ...prev, clients: "Failed to connect to server" }));
      } finally {
        setLoading(prev => ({ ...prev, clients: false }));
      }
    };
    fetchClients();
  }, []);

  // Fetch service providers
  useEffect(() => {
    const fetchProviders = async () => {
      setLoading(prev => ({ ...prev, providers: true }));
      setError(prev => ({ ...prev, providers: null }));
      try {
        const response = await authFetch(`${API_BASE}/service-providers`);
        const data = await response.json();
        if (response.ok) {
          setProviders(data.data || []);
        } else {
          setError(prev => ({ ...prev, providers: data.error || "Failed to fetch providers" }));
        }
      } catch (err) {
        setError(prev => ({ ...prev, providers: "Failed to connect to server" }));
      } finally {
        setLoading(prev => ({ ...prev, providers: false }));
      }
    };
    fetchProviders();
  }, []);

  // Fetch services for dropdown
  useEffect(() => {
    const fetchServices = async () => {
      try {
        const response = await authFetch(`${API_BASE}/services`);
        const data = await response.json();
        if (response.ok) {
          setAvailableServices(data.data || []);
        }
      } catch (err) {
        console.error("Failed to fetch services");
      }
    };
    fetchServices();
  }, []);

  // Fetch cities for dropdown
  useEffect(() => {
    const fetchCities = async () => {
      try {
        const response = await authFetch(`${API_BASE}/cities`);
        const data = await response.json();
        if (response.ok) {
          setAvailableCities(data.data || []);
        }
      } catch (err) {
        console.error("Failed to fetch cities");
      }
    };
    fetchCities();
  }, []);

  // Assign provider to booking
  const assignProvider = async (bookingId, providerId) => {
    try {
      const response = await authFetch(`${API_BASE}/bookings/${bookingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_id: providerId })
      });
      const data = await response.json();
      if (response.ok) {
        // Refresh orders to show updated provider assignment
        const ordersResponse = await authFetch(`${API_BASE}/orders`);
        const ordersData = await ordersResponse.json();
        if (ordersResponse.ok) {
          setOrders(ordersData.data || []);
        }
        setShowAssignModal(false);
        setSelectedOrder(null);
      } else {
        alert(data.error || "Failed to assign provider");
      }
    } catch (err) {
      alert("Failed to connect to server");
    }
  };

  // Open provider assignment for a client using their latest order
  const openAssignForClient = (client) => {
    const clientOrder = orders.find(
      (o) =>
        o.clientName === client.name &&
        o.clientMobile === client.mobile
    );
    if (!clientOrder) {
      alert('No order found for this client.');
      return;
    }
    setSelectedOrder(clientOrder);
    setShowAssignModal(true);
  };

  // Add new service provider
  const addProvider = async () => {
    try {
      const response = await authFetch(`${API_BASE}/service-providers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProvider)
      });
      const data = await response.json();
      if (response.ok) {
        // Refresh providers list
        const providersResponse = await authFetch(`${API_BASE}/service-providers`);
        const providersData = await providersResponse.json();
        if (providersResponse.ok) {
          setProviders(providersData.data || []);
        }
        setShowAddProviderModal(false);
        setNewProvider({
          name: '',
          email: '',
          mobile: '',
          services: [],
          city: '',
          status: 'active',
          password: ''
        });
      } else {
        alert(data.error || "Failed to add provider");
      }
    } catch (err) {
      alert("Failed to connect to server");
    }
  };

  // Toggle service selection
  const toggleService = (serviceName) => {
    setNewProvider(prev => ({
      ...prev,
      services: prev.services.includes(serviceName)
        ? prev.services.filter(s => s !== serviceName)
        : [...prev.services, serviceName]
    }));
  };

  // Handle sorting
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Sort orders
  const sortedOrders = [...orders].sort((a, b) => {
    let comparison = 0;
    if (sortField === 'date') {
      comparison = new Date(a.date) - new Date(b.date);
    } else if (sortField === 'amount') {
      comparison = (a.amount || 0) - (b.amount || 0);
    } else if (sortField === 'status') {
      comparison = (a.status || '').localeCompare(b.status || '');
    }
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  return (
    <div className="min-h-screen bg-warmlinen">

      {/* Navbar */}
      <header className="w-full flex items-center justify-between px-4 md:px-6 pt-4">

          {/* Logo */}
          <span className="font-heading font-extrabold lowercase tracking-tight text-terracotta text-2xl select-none">kynd</span>

          {/* Right */}
          <div className="flex items-center gap-4 text-sm text-warmgrey font-medium">
            <div className="hidden sm:flex flex-col items-end leading-tight">
              <span className="font-semibold text-charcoal">{user?.name || 'Admin'}</span>
              <span className="text-xs text-warmgrey">{user?.email}</span>
            </div>

            <div className="w-9 h-9 rounded-full bg-terracotta/10 flex items-center justify-center font-semibold text-terracotta">
              {user?.name?.charAt(0)?.toUpperCase() || 'A'}
            </div>

            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-lightstone text-charcoal hover:bg-warmlinen transition-colors"
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>

      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto mt-6 md:mt-10 px-4">

        {/* Heading */}
        <div className="mb-8">
          <h2 className="font-heading text-3xl md:text-4xl font-bold text-charcoal">
            Super-Admin Dashboard
          </h2>

          <p className="text-warmgrey mt-2">
            Manage orders, revenue, and services
          </p>
        </div>

        {/* Tabs */}
        <div className="bg-white inline-flex flex-wrap rounded-2xl p-2 shadow-sm mb-8 gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                activeTab === tab.id
                  ? "bg-terracotta text-white shadow"
                  : "text-warmgrey hover:bg-warmlinen"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Container */}
        <div className="bg-white rounded-3xl border border-lightstone min-h-[420px] overflow-hidden">

          {/* Overview Tab */}
          {activeTab === "overview" && (
            <div className="p-8">
              {loading.stats ? (
                <div className="flex items-center justify-center h-[320px]">
                  <p className="text-warmgrey">Loading stats...</p>
                </div>
              ) : error.stats ? (
                <div className="flex items-center justify-center h-[320px]">
                  <p className="text-red-500">{error.stats}</p>
                </div>
              ) : stats ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-gradient-to-br from-accent-50 to-accent-100 rounded-2xl p-6">
                    <p className="text-sm text-terracotta font-medium mb-2">Total Revenue</p>
                    <p className="text-3xl font-bold text-charcoal">S${stats.totalRevenue?.toLocaleString() || 0}</p>
                  </div>
                  <div className="bg-gradient-to-br from-warmlinen to-lightstone/60 rounded-2xl p-6">
                    <p className="text-sm text-warmgrey font-medium mb-2">Total Orders</p>
                    <p className="text-3xl font-bold text-charcoal">{stats.totalOrders || 0}</p>
                  </div>
                  <div className="bg-gradient-to-br from-oat to-oat/80 rounded-2xl p-6">
                    <p className="text-sm text-warmgrey font-medium mb-2">Total Clients</p>
                    <p className="text-3xl font-bold text-charcoal">{stats.totalClients || 0}</p>
                  </div>
                  <div className="bg-gradient-to-br from-accent-200 to-accent-100 rounded-2xl p-6">
                    <p className="text-sm text-accent-700 font-medium mb-2">Growth Rate</p>
                    <p className="text-3xl font-bold text-charcoal">{stats.growthRate?.toFixed(1) || 0}%</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-[320px]">
                  <p className="text-warmgrey">No stats available</p>
                </div>
              )}
            </div>
          )}

          {/* Orders Tab */}
          {activeTab === "orders" && (
            <>
              {/* Sort Header */}
              <div className="flex items-center flex-wrap gap-4 md:gap-10 px-8 py-5 border-b border-lightstone text-sm font-medium text-warmgrey">
                <span className="text-warmgrey">Sort by:</span>
                <button
                  onClick={() => handleSort('date')}
                  className={`${sortField === 'date' ? 'text-terracotta font-semibold' : 'hover:text-charcoal'}`}
                >
                  Date {sortField === 'date' && (sortDirection === 'asc' ? '↑' : '↓')}
                </button>
                <button
                  onClick={() => handleSort('amount')}
                  className={`${sortField === 'amount' ? 'text-terracotta font-semibold' : 'hover:text-charcoal'}`}
                >
                  Amount {sortField === 'amount' && (sortDirection === 'asc' ? '↑' : '↓')}
                </button>
                <button
                  onClick={() => handleSort('status')}
                  className={`${sortField === 'status' ? 'text-terracotta font-semibold' : 'hover:text-charcoal'}`}
                >
                  Status {sortField === 'status' && (sortDirection === 'asc' ? '↑' : '↓')}
                </button>
              </div>

              {/* Orders List */}
              <div className="p-8">
                {loading.orders ? (
                  <div className="flex items-center justify-center h-[320px]">
                    <p className="text-warmgrey">Loading orders...</p>
                  </div>
                ) : error.orders ? (
                  <div className="flex items-center justify-center h-[320px]">
                    <p className="text-red-500">{error.orders}</p>
                  </div>
                ) : orders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[320px] text-center">
                    <div className="w-16 h-16 rounded-full bg-lightstone/40 flex items-center justify-center mb-4">
                      📦
                    </div>
                    <p className="text-warmgrey text-lg font-medium">No orders yet</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {sortedOrders.map((order) => (
                      <div key={order.id} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_140px_100px] items-center gap-2 md:gap-4 p-4 bg-warmlinen rounded-xl">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-terracotta/10 flex items-center justify-center text-terracotta font-semibold shrink-0">
                            {order.clientName?.charAt(0) || 'U'}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-charcoal truncate">{order.clientName || 'Unknown'}</p>
                            <p className="text-sm text-warmgrey truncate">{order.city || 'Unknown City'}</p>
                            {order.providerName && (
                              <p className="text-sm text-terracotta font-medium truncate">
                                Provider: {order.providerName}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-left md:text-right">
                          <p className="font-semibold text-charcoal">S${order.amount?.toLocaleString() || 0}</p>
                          <p className="text-sm text-warmgrey">{new Date(order.date).toLocaleDateString()}</p>
                        </div>
                        <div className="flex justify-start md:justify-center">
                          <div className="px-3 py-1 rounded-full text-xs font-medium bg-sage/10 text-sage">
                            {order.status || 'Pending'}
                          </div>
                        </div>

                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Services Tab */}
          {activeTab === "services" && (
            <div className="p-8">
              {loading.services ? (
                <div className="flex items-center justify-center h-[320px]">
                  <p className="text-warmgrey">Loading services...</p>
                </div>
              ) : error.services ? (
                <div className="flex items-center justify-center h-[320px]">
                  <p className="text-red-500">{error.services}</p>
                </div>
              ) : services.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[320px] text-center">
                  <div className="w-16 h-16 rounded-full bg-lightstone/40 flex items-center justify-center mb-4">
                    🔧
                  </div>
                  <p className="text-warmgrey text-lg font-medium">No services yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {services.map((service) => {
                    const Icon = iconForService(service.name);
                    const imageUrl = service.image
                      ? service.image.startsWith('http')
                        ? service.image
                        : `${API_BASE.replace(/\/api$/, '')}${service.image.startsWith('/') ? '' : '/'}${service.image}`
                      : null;
                    return (
                    <div key={service.id} className="p-4 bg-warmlinen rounded-xl">
                      <div className="w-full aspect-[4/3] bg-lightstone/40 rounded-lg mb-4 flex items-center justify-center overflow-hidden">
                        {imageUrl ? (
                          <img src={imageUrl} alt={service.name} className="w-full h-full object-cover" />
                        ) : (
                          <Icon className="w-14 h-14 text-terracotta" strokeWidth={1.75} />
                        )}
                      </div>
                      <h3 className="font-semibold text-charcoal">{service.name}</h3>
                      <p className="text-sm text-warmgrey">{service.category}</p>
                      <div className="flex items-center justify-between mt-2">
                        <p className="font-bold text-terracotta">S${service.price?.toLocaleString() || 0}</p>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          service.status === 'Available' ? 'bg-sage/10 text-sage' : 'bg-red-100 text-red-700'
                        }`}>
                          {service.status}
                        </span>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === "providers" && (
            <div className="p-8">
              <div className="mb-6">
                <h3 className="font-heading text-xl font-bold text-charcoal">Partners</h3>
              </div>
              {loading.providers ? (
                <div className="flex items-center justify-center h-[320px]">
                  <p className="text-warmgrey">Loading providers...</p>
                </div>
              ) : error.providers ? (
                <div className="flex items-center justify-center h-[320px]">
                  <p className="text-red-500">{error.providers}</p>
                </div>
              ) : providers.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[320px] text-center">
                  <div className="w-16 h-16 rounded-full bg-lightstone/40 flex items-center justify-center mb-4">
                    👤
                  </div>
                  <p className="text-warmgrey text-lg font-medium">No service providers yet</p>
                  <p className="text-sm text-warmgrey mt-2">Add service providers to assign them to bookings</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {providers.map((provider) => (
                    <div key={provider.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-0 p-4 bg-warmlinen rounded-xl">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-terracotta/10 flex items-center justify-center text-terracotta font-semibold text-lg">
                          {provider.name?.charAt(0) || 'P'}
                        </div>
                        <div>
                          <p className="font-medium text-charcoal">{provider.name || 'Unknown'}</p>
                          <p className="text-sm text-warmgrey">{provider.mobile || 'No phone'}</p>
                          <p className="text-sm text-warmgrey">{provider.city || 'No city'}</p>
                        </div>
                      </div>
                      <div className="text-left md:text-right">
                        <div className="flex items-center gap-1 mb-1">
                          <span className="text-yellow-500">⭐</span>
                          <span className="font-semibold text-charcoal">{provider.rating || 0}</span>
                        </div>
                        <p className="text-sm text-warmgrey">{provider.total_jobs || 0} jobs</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        provider.status === 'active' ? 'bg-sage/10 text-sage' :
                        provider.status === 'busy' ? 'bg-amber-100 text-amber-700' :
                        'bg-lightstone/40 text-warmgrey'
                      }`}>
                        {provider.status || 'Active'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Clients Tab */}
          {activeTab === "clients" && (
            <div className="p-8">
              {loading.clients ? (
                <div className="flex items-center justify-center h-[320px]">
                  <p className="text-warmgrey">Loading clients...</p>
                </div>
              ) : error.clients ? (
                <div className="flex items-center justify-center h-[320px]">
                  <p className="text-red-500">{error.clients}</p>
                </div>
              ) : clients.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[320px] text-center">
                  <div className="w-16 h-16 rounded-full bg-lightstone/40 flex items-center justify-center mb-4">
                    👥
                  </div>
                  <p className="text-warmgrey text-lg font-medium">No clients yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {clients.map((client) => (
                    <div key={client.id} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_160px_120px] items-center gap-2 md:gap-4 p-4 bg-warmlinen rounded-xl">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-terracotta/10 flex items-center justify-center text-terracotta font-semibold shrink-0">
                          {client.avatar || client.name?.charAt(0) || 'U'}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-charcoal truncate">{client.name || 'Unknown'}</p>
                          <p className="text-sm text-warmgrey truncate">{client.mobile || 'No phone'}</p>
                        </div>
                      </div>
                      <div className="text-left md:text-center">
                        <p className="font-semibold text-charcoal">{client.totalOrders || 0} orders</p>
                        <p className="text-sm text-warmgrey">S${(client.totalSpend || 0).toLocaleString()}</p>
                      </div>
                      <span className={`justify-self-start md:justify-self-end px-3 py-1 rounded-full text-xs font-medium ${
                        client.status === 'Active' ? 'bg-sage/10 text-sage' : 'bg-lightstone/40 text-warmgrey'
                      }`}>
                        {client.status || 'Active'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Provider Assignment Modal */}
      {showAssignModal && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4">
            <h3 className="font-heading text-xl font-bold text-charcoal mb-4">Assign Service Provider</h3>
            <p className="text-warmgrey mb-4">
              Order for: <span className="font-semibold">{selectedOrder.clientName}</span>
            </p>

            <div className="space-y-3 max-h-64 overflow-y-auto mb-4">
              {providers.length === 0 ? (
                <p className="text-warmgrey text-center py-4">No service providers available</p>
              ) : (
                providers
                  .filter(provider => provider.status === 'active')
                  .map((provider) => (
                    <button
                      key={provider.id}
                      onClick={() => assignProvider(selectedOrder.id, provider.id)}
                      className="w-full flex items-center justify-between p-3 bg-warmlinen rounded-xl hover:bg-lightstone/40 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-terracotta/10 flex items-center justify-center text-terracotta font-semibold">
                          {provider.name?.charAt(0) || 'P'}
                        </div>
                        <div className="text-left">
                          <p className="font-medium text-charcoal">{provider.name}</p>
                          <p className="text-sm text-warmgrey">{provider.city}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1">
                          <span className="text-yellow-500">⭐</span>
                          <span className="font-semibold text-charcoal">{provider.rating || 0}</span>
                        </div>
                        <p className="text-sm text-warmgrey">{provider.total_jobs || 0} jobs</p>
                      </div>
                    </button>
                  ))
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setSelectedOrder(null);
                }}
                className="flex-1 px-4 py-2 bg-warmlinen text-charcoal rounded-xl font-medium hover:bg-lightstone transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Provider Modal */}
      {showAddProviderModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4">
            <h3 className="font-heading text-xl font-bold text-charcoal mb-4">Add Service Provider</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">Name</label>
                <input
                  type="text"
                  value={newProvider.name}
                  onChange={(e) => setNewProvider({ ...newProvider, name: e.target.value })}
                  className="w-full px-4 py-2 border border-lightstone rounded-xl outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/30"
                  placeholder="Enter provider name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">Email</label>
                <input
                  type="email"
                  value={newProvider.email}
                  onChange={(e) => setNewProvider({ ...newProvider, email: e.target.value })}
                  className="w-full px-4 py-2 border border-lightstone rounded-xl outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/30"
                  placeholder="Enter email"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">Mobile</label>
                <input
                  type="text"
                  value={newProvider.mobile}
                  onChange={(e) => setNewProvider({ ...newProvider, mobile: e.target.value })}
                  className="w-full px-4 py-2 border border-lightstone rounded-xl outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/30"
                  placeholder="Enter mobile number"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">Password</label>
                <input
                  type="password"
                  value={newProvider.password}
                  onChange={(e) => setNewProvider({ ...newProvider, password: e.target.value })}
                  className="w-full px-4 py-2 border border-lightstone rounded-xl outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/30"
                  placeholder="Enter password for provider login"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">Services</label>
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) toggleService(e.target.value);
                  }}
                  disabled={availableServices.length === 0}
                  className="w-full px-4 py-2 border border-lightstone rounded-xl outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/30 disabled:opacity-60"
                >
                  <option value="">
                    {availableServices.length === 0 ? "Loading services..." : "Add a service"}
                  </option>
                  {availableServices
                    .filter((service) => !newProvider.services.includes(service.name))
                    .map((service) => (
                      <option key={service.id} value={service.name}>
                        {service.name}
                      </option>
                    ))}
                </select>

                {newProvider.services.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {newProvider.services.map((name) => (
                      <span
                        key={name}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-terracotta/10 text-terracotta"
                      >
                        {name}
                        <button
                          type="button"
                          onClick={() => toggleService(name)}
                          aria-label={`Remove ${name}`}
                          className="text-terracotta hover:text-charcoal leading-none"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">City</label>
                <select
                  value={newProvider.city}
                  onChange={(e) => setNewProvider({ ...newProvider, city: e.target.value })}
                  className="w-full px-4 py-2 border border-lightstone rounded-xl outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/30"
                >
                  <option value="">Select city</option>
                  {availableCities.length === 0 ? (
                    <option value="">Loading cities...</option>
                  ) : (
                    availableCities.map((city) => (
                      <option key={city.id} value={city.cityName}>
                        {city.cityName}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">Status</label>
                <select
                  value={newProvider.status}
                  onChange={(e) => setNewProvider({ ...newProvider, status: e.target.value })}
                  className="w-full px-4 py-2 border border-lightstone rounded-xl outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/30"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="busy">Busy</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddProviderModal(false);
                  setNewProvider({
                    name: '',
                    email: '',
                    mobile: '',
                    services: [],
                    city: '',
                    status: 'active'
                  });
                }}
                className="flex-1 px-4 py-2 bg-warmlinen text-charcoal rounded-xl font-medium hover:bg-lightstone transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addProvider}
                className="flex-1 px-4 py-2 bg-terracotta text-white rounded-full font-medium hover:bg-charcoal transition-colors"
              >
                Add Provider
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
