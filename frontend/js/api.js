// Import configuration
// Load config.js first in your HTML file
// API URL base will be set by config.js

async function requestApi(url, options = {}) {
  // Setup headers
  options.headers = options.headers || {};

  // Tambahkan API key via query parameter (lebih reliable lewat Netlify proxy)
  const separator = url.includes('?') ? '&' : '?';
  url = `${url}${separator}api_key=${encodeURIComponent(API_KEY)}`;

  if (options.body instanceof FormData) {
    if (options.headers) {
      delete options.headers['Content-Type'];
      delete options.headers['content-type'];
    }
  } else if (!options.headers['Content-Type'] && !(options.body instanceof FormData)) {
      // Hanya set JSON jika bukan FormData
      options.headers['Content-Type'] = 'application/json';
  }

  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Gagal menghubungi API');
    }
    return await response.json();
  } catch (error) {
    console.error('API request error:', error);
    return { error: error.message || 'Terjadi kesalahan jaringan' };
  }
}

async function fetchAllProduk() {
  return await requestApi(`${API_BASE}?action=fetchProduk`);
}

async function fetchAllKategori() {
  return await requestApi(`${API_BASE}?action=fetchKategori`);
}

async function fetchProdukById(id) {
  return await requestApi(`${API_BASE}?action=fetchProdukById&id=${encodeURIComponent(id)}`);
}

async function populateKategoriDropdown() {
  const kategori = await fetchAllKategori();
  const select = document.getElementById('kategori-produk');
  if (!select) return;

  if (kategori.error) {
    select.innerHTML = '<option value="" disabled selected>Gagal memuat kategori</option>';
    return;
  }

  select.innerHTML = '<option value="" disabled selected>Pilih kategori</option>' +
    kategori.map(k => `<option value="${k.id_kategori}">${k.jenis_kategori}</option>`).join('');
}

async function addProduk(produkData) {
  return await requestApi(`${API_BASE}?action=addProduk`, {
    method: 'POST',
    body: produkData,
  });
}

async function updateProduk(id, produkData) {
  return await requestApi(`${API_BASE}?action=updateProduk&id=${encodeURIComponent(id)}`, {
    method: 'POST',
    body: produkData,
  });
}

async function deleteProduk(id) {
  return await requestApi(`${API_BASE}?action=deleteProduk&id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });
}

function formatRupiah(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(value);
}

function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

async function showDetailModal(id) {
  const produk = await fetchProdukById(id);
  
  if (produk.error) {
    Swal.fire({ icon: 'error', title: 'Oops...', text: 'Gagal memuat detail produk', background: '#1a1a1a', color: '#fff', confirmButtonColor: '#ff4d4d' });
    return;
  }

  // Ambil data produk (bisa berupa object atau array)
  const product = Array.isArray(produk) ? produk[0] : produk;
  if (!product) {
    Swal.fire({ icon: 'warning', title: 'Oops...', text: 'Produk tidak ditemukan', background: '#1a1a1a', color: '#fff', confirmButtonColor: '#f39c12' });
    return;
  }

  console.log('showDetailModal - Product ID:', product.id_produk);

  // Isi modal dengan data
  document.getElementById('modalTitle').textContent = product.nama_produk;
  document.getElementById('detailNama').textContent = product.nama_produk;
  document.getElementById('detailKategori').textContent = product.jenis_kategori || 'Tanpa kategori';
  document.getElementById('detailHarga').textContent = formatRupiah(product.harga);
  document.getElementById('detailStok').textContent = product.stok + ' unit';
  document.getElementById('detailDeskripsi').textContent = product.deskripsi || 'Tidak ada deskripsi';
  document.getElementById('detailCreated').textContent = formatDate(product.created_at);
  document.getElementById('detailUpdated').textContent = formatDate(product.updated_at);
  
  // Set gambar
  const imageUrl = product.gambar ? `${UPLOAD_BASE}/${product.gambar}` : 'images/logo.png';
  const detailImg = document.getElementById('detailImage');
  detailImg.onerror = function() { this.onerror = null; this.src = 'images/logo.png'; this.style.opacity = '0.5'; };
  detailImg.src = imageUrl;
  
  // Set href tombol edit dengan URL yang benar
  const editBtn = document.getElementById('editBtn');
  if (editBtn) {
    editBtn.href = `update.html?id=${product.id_produk}`;
    editBtn.dataset.productId = product.id_produk;
    sessionStorage.setItem('editProductId', product.id_produk);
    console.log('Edit button href set to:', editBtn.href);
    console.log('SessionStorage editProductId set to:', sessionStorage.getItem('editProductId'));
  }
  
  // Tampilkan modal
  const modal = new bootstrap.Modal(document.getElementById('detailModal'));
  modal.show();
}

// State untuk menyimpan semua produk agar tidak perlu fetch berulang kali saat filter
let allProductsCache = null;

async function displayProduk(kategoriId = null) {
  let produk = allProductsCache;
  if (!produk) {
    produk = await fetchAllProduk();
    if (!produk.error) {
      allProductsCache = produk;
    }
  }

  const container = document.getElementById('produk-container');
  if (!container) return;

  if (produk.error) {
    container.innerHTML = `<div class="col-12"><div class="alert alert-danger">${produk.error}</div></div>`;
    return;
  }

  let filteredProduk = produk;
  if (kategoriId) {
    filteredProduk = produk.filter(p => p.kategori_id == kategoriId);
  }

  if (!filteredProduk.length) {
    container.innerHTML = '<div class="col-12"><p class="text-center text-muted">Belum ada produk.</p></div>';
    return;
  }

  container.innerHTML = filteredProduk.map(item => {
    const kategori = item.jenis_kategori ? item.jenis_kategori : 'Tanpa kategori';
    const imageUrl = item.gambar ? `${UPLOAD_BASE}/${item.gambar}` : 'images/logo.png';
    return `
      <div class="col-6 col-md-4 col-lg-3">
        <div class="product-card h-100">
          <div class="img-wrapper">
            <img src="${imageUrl}" alt="${item.nama_produk}" loading="lazy" onerror="this.onerror=null;this.src='images/logo.png';this.style.opacity='0.5'">
          </div>
          <div class="card-body">
            <span class="product-kategori">${kategori}</span>
            <h5 class="product-title">${item.nama_produk}</h5>
            <div class="product-stock"><i class="bi bi-box-seam me-1"></i>Stok: ${item.stok}</div>
            <div class="product-price">${formatRupiah(item.harga)}</div>
            <div class="product-actions">
              <button class="btn-update" onclick="showDetailModal('${item.id_produk}')">
                <i class="bi bi-eye me-1"></i>Detail
              </button>
              <button class="btn-hapus" onclick="handleDeleteProduk('${item.id_produk}')" title="Hapus Produk">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function populateKategoriFilter() {
  const kategori = await fetchAllKategori();
  const menu = document.getElementById('filter-kategori-menu');
  const pillsContainer = document.getElementById('category-pills-container');
  
  if (kategori.error) return;

  // Untuk dropdown navbar
  if (menu) {
    let html = `<li><a class="dropdown-item" href="#" onclick="filterProduk(null, 'Semua Kategori', null)">Semua Kategori</a></li>`;
    html += kategori.map(k => `<li><a class="dropdown-item" href="#" onclick="filterProduk('${k.id_kategori}', '${k.jenis_kategori}', null)">${k.jenis_kategori}</a></li>`).join('');
    menu.innerHTML = html;
  }

  // Untuk pills horizontal
  if (pillsContainer) {
    let pillsHtml = `<button class="btn-pill active" onclick="filterProduk(null, 'Semua Kategori', this)">Semua Kategori</button>`;
    pillsHtml += kategori.map(k => `<button class="btn-pill" onclick="filterProduk('${k.id_kategori}', '${k.jenis_kategori}', this)">${k.jenis_kategori}</button>`).join('');
    pillsContainer.innerHTML = pillsHtml;
  }
}

function filterProduk(kategoriId, namaKategori, clickedElement = null) {
  const btn = document.getElementById('btn-kategori-dropdown');
  if (btn) {
    btn.innerHTML = `<i class="bi bi-grid me-1"></i>${namaKategori}`;
  }
  
  if (clickedElement && clickedElement.classList.contains('btn-pill')) {
      const pills = document.querySelectorAll('.btn-pill');
      pills.forEach(p => p.classList.remove('active'));
      clickedElement.classList.add('active');
  } else if (!clickedElement) {
      // Jika dari dropdown, coba cari pill yang sesuai
      const pills = document.querySelectorAll('.btn-pill');
      pills.forEach(p => {
          if(p.textContent === namaKategori) p.classList.add('active');
          else p.classList.remove('active');
      });
  }

  displayProduk(kategoriId);
}

async function handleDeleteProduk(id) {
  const confirmResult = await Swal.fire({
    title: 'Hapus Produk?',
    text: "Produk ini akan dihapus permanen!",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ff4d4d',
    cancelButtonColor: '#1e1e1e',
    confirmButtonText: 'Ya, hapus!',
    cancelButtonText: 'Batal',
    background: '#1a1a1a',
    color: '#fff'
  });

  if (!confirmResult.isConfirmed) {
    return;
  }
  
  const result = await deleteProduk(id);
  if (result.success) {
    await Swal.fire({
      icon: 'success',
      title: 'Terhapus!',
      text: 'Produk berhasil dihapus.',
      background: '#1a1a1a',
      color: '#fff',
      confirmButtonColor: '#00a876'
    });
    allProductsCache = null;
    displayProduk();
  } else {
    Swal.fire({
      icon: 'error',
      title: 'Gagal',
      text: 'Gagal hapus produk: ' + result.error,
      background: '#1a1a1a',
      color: '#fff',
      confirmButtonColor: '#ff4d4d'
    });
  }
}

async function handleAddProduk(event) {
  event.preventDefault();
  const nama = document.getElementById('nama-produk').value.trim();
  const hargaRaw = document.getElementById('harga-produk').value.replace(/\./g, '');
  const harga = parseFloat(hargaRaw);
  const stok = parseInt(document.getElementById('stok-produk').value, 10);
  const kategori_id = document.getElementById('kategori-produk').value;
  const deskripsi = document.getElementById('deskripsi-produk').value.trim();

  if (!nama || isNaN(harga) || isNaN(stok) || !kategori_id) {
    Swal.fire({ icon: 'warning', title: 'Perhatian', text: 'Nama, harga, stok, dan kategori harus diisi dengan benar.', background: '#1a1a1a', color: '#fff', confirmButtonColor: '#f39c12' });
    return;
  }

  const formData = new FormData();
  formData.append('nama_produk', nama);
  formData.append('harga', harga);
  formData.append('stok', stok);
  formData.append('kategori_id', kategori_id);
  if (deskripsi) formData.append('deskripsi', deskripsi);

  await buildGambarFormData(formData);
  const result = await addProduk(formData);

  if (result.success) {
    await Swal.fire({
      icon: 'success', title: 'Berhasil!', text: 'Produk berhasil ditambahkan',
      background: '#1a1a1a', color: '#fff', confirmButtonColor: '#00a876', timer: 1500, showConfirmButton: false
    });
    window.location.href = 'index.html';
  } else {
    Swal.fire({
      icon: 'error', title: 'Gagal', text: 'Gagal tambah produk: ' + result.error,
      background: '#1a1a1a', color: '#fff', confirmButtonColor: '#ff4d4d'
    });
  }
}

async function loadProdukForEdit() {
  const params = new URLSearchParams(window.location.search);
  let id = params.get('id');
  console.log('loadProdukForEdit - ID dari URL:', id);

  if (!id) {
    id = sessionStorage.getItem('editProductId');
    console.log('loadProdukForEdit - ID dari sessionStorage:', id);
    if (id) {
      sessionStorage.removeItem('editProductId');
    }
  }

  if (!id) {
    await Swal.fire({ icon: 'error', title: 'Oops...', text: 'ID Produk tidak ditemukan di URL! Kembali ke halaman utama.', background: '#1a1a1a', color: '#fff', confirmButtonColor: '#ff4d4d' });
    window.location.href = 'index.html';
    return;
  }

  // Simpan ID secara global agar bisa digunakan saat proses update dan delete
  window.currentEditId = id;

  const produk = await fetchProdukById(id);
  console.log('API Response:', produk);
  
  if (!produk || produk.error) {
    await Swal.fire({ icon: 'error', title: 'Oops...', text: produk?.error || 'Produk tidak ditemukan', background: '#1a1a1a', color: '#fff', confirmButtonColor: '#ff4d4d' });
    return;
  }

  // Handle jika API mengembalikan array
  const product = Array.isArray(produk) ? produk[0] : produk;
  
  if (!product) {
    await Swal.fire({ icon: 'warning', title: 'Oops...', text: 'Data produk kosong', background: '#1a1a1a', color: '#fff', confirmButtonColor: '#f39c12' });
    console.error('Product data is empty', produk);
    return;
  }

  console.log('Product data:', product);

  document.getElementById('nama-produk').value = product.nama_produk || '';
  document.getElementById('stok-produk').value = product.stok || '';
  document.getElementById('deskripsi-produk').value = product.deskripsi || '';

  // Format harga dengan titik setiap 3 digit
  const hargaEl = document.getElementById('harga-produk');
  if (hargaEl && product.harga) {
    const raw = String(Math.round(product.harga));
    hargaEl.value = raw.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  // Set kategori - tunggu category dropdown siap
  if (product.kategori_id) {
    const select = document.getElementById('kategori-produk');
    if (select) {
      select.value = product.kategori_id;
      console.log('Kategori set ke:', product.kategori_id);
    } else {
      console.warn('Kategori select element tidak ditemukan');
    }
  }

  // Tampilkan gambar existing
  if (product.gambar) {
    const url = `${UPLOAD_BASE}/${product.gambar}`;
    console.log('Loading image:', url); // Debug: log URL gambar
    if (typeof setPreviewFromUrl === 'function') {
      setPreviewFromUrl(url);
    } else {
      const imgPreview = document.getElementById('img-preview');
      const imgPlaceholder = document.getElementById('img-placeholder');
      const btnRemove = document.getElementById('btn-remove-img');
      if (imgPreview) {
        imgPreview.onerror = function() { this.onerror = null; console.error('Gagal load gambar:', url); };
        imgPreview.src = url;
        imgPreview.style.display = 'block';
        if (imgPlaceholder) imgPlaceholder.style.display = 'none';
        if (btnRemove) btnRemove.style.display = 'flex';
        console.log('Gambar dimuat:', product.gambar);
      }
    }
  } else {
    console.warn('Produk tidak memiliki gambar');
  }
}

async function handleUpdateProduk(event) {
  event.preventDefault();
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id') || window.currentEditId || sessionStorage.getItem('editProductId');

  if (!id) {
    alert('ID produk tidak ditemukan');
    return;
  }

  const nama = document.getElementById('nama-produk').value.trim();
  const hargaRaw = document.getElementById('harga-produk').value.replace(/\./g, '');
  const harga = parseFloat(hargaRaw);
  const stok = parseInt(document.getElementById('stok-produk').value, 10);
  const kategori_id = document.getElementById('kategori-produk').value;
  const deskripsi = document.getElementById('deskripsi-produk').value.trim();

  if (!nama || isNaN(harga) || isNaN(stok) || !kategori_id) {
    Swal.fire({ icon: 'warning', title: 'Perhatian', text: 'Nama, harga, stok, dan kategori harus diisi dengan benar.', background: '#1a1a1a', color: '#fff', confirmButtonColor: '#f39c12' });
    return;
  }

  const formData = new FormData();
  formData.append('id', id);
  formData.append('nama_produk', nama);
  formData.append('harga', harga);
  formData.append('stok', stok);
  formData.append('kategori_id', kategori_id);
  if (deskripsi) formData.append('deskripsi', deskripsi);

  await buildGambarFormData(formData);

  // Debug: log FormData entries
  console.log('=== UPDATE PRODUK DEBUG ===');
  console.log('ID:', id);
  for (let [key, value] of formData.entries()) {
    if (value instanceof File) {
      console.log(`${key}: File(${value.name}, ${value.size} bytes, ${value.type})`);
    } else {
      console.log(`${key}: ${value}`);
    }
  }

  const result = await updateProduk(id, formData);

  if (result.success) {
    await Swal.fire({
      icon: 'success', title: 'Berhasil!', text: 'Produk berhasil diupdate',
      background: '#1a1a1a', color: '#fff', confirmButtonColor: '#00a876', timer: 1500, showConfirmButton: false
    });
    window.location.href = 'index.html';
  } else {
    Swal.fire({
      icon: 'error', title: 'Gagal', text: 'Gagal update produk: ' + result.error,
      background: '#1a1a1a', color: '#fff', confirmButtonColor: '#ff4d4d'
    });
  }
}
