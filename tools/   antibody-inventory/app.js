/**
 * 抗体库存管理系统（Antibody Inventory Manager）
 * Version: 1.0.0
 *
 * 设计目标
 * - 以“容器(Box) → 网格(Vial positions)”的方式管理抗体库存位置与信息
 * - 支持：新增/删除容器、格子拖拽移动、批量入库、余量扣减、阈值预警、全局搜索、导入导出备份
 *
 * 数据持久化
 * - 使用 localStorage 进行本地持久化；键名为 STORAGE_KEY
 *
 * 兼容性说明
 * - 本版本仅维护 v1 数据结构：db = { boxes: { [boxId]: Box } }
 * - 如需兼容旧版本字段，请在“数据结构标准化检查”处增加迁移逻辑
 *
 * 代码结构
 * - 全局状态与初始化
 * - 下拉菜单与表单交互
 * - 容器管理（Box）
 * - 网格渲染与格子交互（Vial）
 * - 拖拽逻辑
 * - 面板与批量入库
 * - 全局搜索与预警
 * - 数据持久化/导入导出
 */

// ========= 全局变量与初始化 =========
    // 使用正式的 v1.0 存储键名
    const STORAGE_KEY = 'antibody_storage_v1_db';
    /** 应用语义化版本号（用于发布/追踪，不参与业务逻辑） */
    const APP_VERSION = '1.0.0';
    let db = JSON.parse(localStorage.getItem(STORAGE_KEY)) || { boxes: {} };
    let currentBoxId = null;
    let selectedPositions = new Set();
    let searchHighlightPos = null; // 用于搜索跳转后的高亮

    // ========= 抗体字段下拉菜单 =========
    const VENDOR_OPTIONS = [
        'Abcam','Cell Signaling Technology (CST)','Proteintech','Santa Cruz','Thermo Fisher',
        'Sigma-Aldrich','BD Biosciences','BioLegend','Jackson ImmunoResearch','其他（自定义）'
    ];
    const CONC_OPTIONS = ['0.05 mg/mL','0.1 mg/mL','0.2 mg/mL','0.5 mg/mL','1 mg/mL','2 mg/mL','5 mg/mL','未知','其他（自定义）'];

    const STORAGE_OPTIONS = ['4°C','-20°C','-80°C','室温','避光','其他（自定义）'];

    const HOST_OPTIONS = ['Mouse','Rabbit','Rat','Goat','Sheep','Chicken','Human','其他（自定义）'];
    const ISOTYPE_OPTIONS = ['IgG','IgG1','IgG2a','IgG2b','IgM','IgA','IgE','IgY','Unknown','其他（自定义）'];
    const CONJUGATE_OPTIONS = ['未偶联（需要二抗）','HRP','AP','Biotin','FITC','PE','APC','Alexa Fluor 488','Alexa Fluor 555','Alexa Fluor 594','Alexa Fluor 647','其他（自定义）'];

    const AMOUNT_UNIT_OPTIONS = ['µL','mL','mg','µg','Unknown'];


    // v1.0.0：数据模型不包含“对应二抗”字段；仅维护宿主/同型/靶标等主信息，避免字段语义重复。

    const DROPDOWN_STORE_KEY = 'antibody_dropdown_custom_options_v1';
    function loadCustomDropdowns() {
        try { return JSON.parse(localStorage.getItem(DROPDOWN_STORE_KEY) || '{}'); } catch(e) { return {}; }
    }
    function saveCustomDropdowns(custom) {
        localStorage.setItem(DROPDOWN_STORE_KEY, JSON.stringify(custom || {}));
    }


    function fillSelect(selectId, options, placeholderText) {
        const sel = document.getElementById(selectId);
        if (!sel) return;
        sel.innerHTML = '';
        const ph = document.createElement('option');
        ph.value = '';
        ph.textContent = placeholderText;
        ph.disabled = true;
        ph.selected = true;
        sel.appendChild(ph);
        options.forEach(o => {
            const opt = document.createElement('option');
            opt.value = (o === '其他（自定义）') ? '__custom__' : o;
            opt.textContent = o;
            sel.appendChild(opt);
        });
    }

    function bindCustomSelect(selectId, labelForPrompt, storeField) {
        const sel = document.getElementById(selectId);
        if (!sel) return;
        sel.addEventListener('change', () => {
            if (sel.value !== '__custom__') return;
            const v = prompt(`请输入${labelForPrompt}（将被保存为一个新选项）：`);
            if (!v) { sel.value = ''; return; }
            // 插入并选中自定义选项（插入到“其他（自定义）”之前）
            const customOpt = document.createElement('option');
            customOpt.value = v;
            customOpt.textContent = v;
            const customIdx = Array.from(sel.options).findIndex(o => o.value === '__custom__');
            sel.insertBefore(customOpt, sel.options[customIdx]);
            sel.value = v;
        
            // 记录自定义选项，供下次打开继续使用
            const custom = loadCustomDropdowns();
            const arr = custom[storeField] || [];
            if (!arr.includes(v)) arr.unshift(v);
            custom[storeField] = arr.slice(0, 50);
            saveCustomDropdowns(custom);
        });
    }

    function populateAntibodyDropdowns() {
        const custom = loadCustomDropdowns();
        const vendors = Array.from(new Set([...(custom.vendor || []), ...VENDOR_OPTIONS]));
        const concs = Array.from(new Set([...(custom.conc || []), ...CONC_OPTIONS]));
        const stores = Array.from(new Set([...(custom.storage || []), ...STORAGE_OPTIONS]));

        fillSelect('ab-vendor', vendors, '请选择供应商');
        fillSelect('ab-conc', concs, '请选择浓度');        fillSelect('ab-storage', stores, '请选择保存条件');

        
        const hosts = Array.from(new Set([...(custom.host || []), ...HOST_OPTIONS]));
        const isotypes = Array.from(new Set([...(custom.isotype || []), ...ISOTYPE_OPTIONS]));
        const conjugates = Array.from(new Set([...(custom.conjugate || []), ...CONJUGATE_OPTIONS]));
        fillSelect('ab-host', hosts, '请选择宿主');
        fillSelect('ab-isotype', isotypes, '请选择同型');
        fillSelect('ab-conjugate', conjugates, '请选择是否偶联');

        // 余量单位
        fillSelect('ab-amount-unit', AMOUNT_UNIT_OPTIONS, '请选择单位');
bindCustomSelect('ab-vendor', '供应商', 'vendor');
        bindCustomSelect('ab-conc', '浓度', 'conc');        bindCustomSelect('ab-storage', '保存条件', 'storage');
    
        bindCustomSelect('ab-host', '宿主', 'host');
        bindCustomSelect('ab-isotype', '同型', 'isotype');
        bindCustomSelect('ab-conjugate', '偶联/直标', 'conjugate');
}

    

    function isConjugated(v) {
        return v && v !== '未偶联（需要二抗）' && v !== '__custom__';
    }


    function calcRemaining(item) {
        const amount = parseFloat(item.amount ?? '') ;
        const per = parseFloat(item.usePer ?? '');
        const used = parseInt(item.usedCount ?? '0', 10) || 0;
        if (isNaN(amount)) return { ok:false, remaining:null };
        const perVal = isNaN(per) ? 0 : per;
        const rem = amount - used * perVal;
        return { ok:true, remaining: Math.max(0, rem) };
    }

    function updateRemainingUI() {
        const remEl = document.getElementById('ab-remaining');
        if (!remEl) return;
        const amount = document.getElementById('ab-amount')?.value || '';
        const unit = document.getElementById('ab-amount-unit')?.value || '';
        const per = document.getElementById('ab-use-per')?.value || '';
        const used = document.getElementById('ab-used-count')?.value || '0';
        const item = { amount, usePer: per, usedCount: used };
        const r = calcRemaining(item);
        const labelUnit = (unit && unit !== 'Unknown') ? unit : '';
        document.getElementById('ab-use-unit-label') && (document.getElementById('ab-use-unit-label').textContent = labelUnit);
        document.getElementById('ab-warn-unit-label') && (document.getElementById('ab-warn-unit-label').textContent = labelUnit);
        if (!r.ok) { remEl.textContent = '-'; return; }
        remEl.textContent = `${r.remaining.toFixed(2)} ${labelUnit}`.trim();
        // 简单颜色提示
        const thr = parseFloat(document.getElementById('ab-warn-threshold')?.value || '');
        if (!isNaN(thr) && r.remaining <= thr) remEl.style.borderColor = '#ff4d4f';
        else remEl.style.borderColor = '#d9d9d9';
    }

    function bindUsageButtons() {
        const useBtn = document.getElementById('use-once-btn');
        const undoBtn = document.getElementById('undo-use-btn');
        const usedInput = document.getElementById('ab-used-count');
        if (useBtn && usedInput) {
            useBtn.addEventListener('click', () => {
                const v = parseInt(usedInput.value || '0', 10) || 0;
                usedInput.value = v + 1;
                updateRemainingUI();
            });
        }
        if (undoBtn && usedInput) {
            undoBtn.addEventListener('click', () => {
                const v = parseInt(usedInput.value || '0', 10) || 0;
                usedInput.value = Math.max(0, v - 1);
                updateRemainingUI();
            });
        }
        ['ab-amount','ab-amount-unit','ab-use-per','ab-used-count','ab-warn-threshold'].forEach(id => {
            const el = document.getElementById(id);
            el && el.addEventListener('input', updateRemainingUI);
            el && el.addEventListener('change', updateRemainingUI);
        });
    }

    
    // 已移除“对应二抗”字段，因此不再进行二抗联动推荐

let draggedItemPos = null;     // 用于拖拽记录起始位置
    /**
     * 应用入口：初始化数据库结构、渲染 UI、绑定事件监听器。
     * 约定：该函数只在页面加载完成后调用一次。
     */
    function init() {
        populateAntibodyDropdowns();
                bindUsageButtons();
// 数据结构标准化检查 (确保旧数据包含 rows/cols 属性)
        let dataNormalized = false;
        Object.values(db.boxes).forEach(box => {
            if (box.size && !box.rows) {
                box.rows = box.size;
                box.cols = box.size;
                dataNormalized = true;
            }
        });
        if (dataNormalized) save();
        
        renderBoxList();
        updateWarningBoard();
        // 如果没有容器，显示提示信息
        if (Object.keys(db.boxes).length === 0) document.getElementById('empty-tip').style.display = 'block';
    }

    // ========= 核心业务逻辑：容器管理 =========
    
    function renameCurrentBox() {
        if (!currentBoxId) { alert('请先在左侧选择一个容器'); return; }
        const box = db.boxes[currentBoxId];
        if (!box) { alert('未找到当前容器'); return; }
        const name = prompt('请输入新的容器名称:', box.name || '');
        if (!name) return;
        box.name = name.trim();
        save();
        renderBoxList();
    }
    /**
     * 新增容器（Box）。
     * - 生成唯一 boxId
     * - 初始化 rows/cols/grid
     * - 保存并切换到新容器
     */
    function addNewBox() {
        const name = prompt("请输入容器名称 (例如: 抗体盒-1):"); if (!name) return;
        // 解析下拉菜单中的行列规格值 "rows,cols"
        let rows, cols;
        const spec = document.getElementById('new-box-specs').value;
        if (spec === '10x10') { rows = 10; cols = 10; }
        else if (spec === '9x9') { rows = 9; cols = 9; }
        else {
          rows = parseInt(document.getElementById('custom-rows')?.value || '8', 10) || 8;
          cols = parseInt(document.getElementById('custom-cols')?.value || '12', 10) || 12;
        }
        const specs = [rows, cols];
        const id = 'box_' + Date.now();
        db.boxes[id] = { name, rows: specs[0], cols: specs[1], vials: {} };
        save(); renderBoxList(); switchBox(id);
    }

    function deleteBox(id, event) {
        event.stopPropagation(); // 阻止点击事件冒泡，避免触发切换盒子
        if (!confirm(`⚠️ 高能预警

确定要永久删除容器【${db.boxes[id].name}】及其内所有抗体吗？
此操作无法撤销！`)) return;
        
        delete db.boxes[id];
        save();
        // 如果删除的是当前显示的盒子，重置视图
        if (currentBoxId === id) {
            currentBoxId = null;
            document.getElementById('grid').innerHTML = '';
            document.getElementById('empty-tip').style.display = 'block';
            updatePanel();
        }
        renderBoxList();
        updateWarningBoard();
    }

    function renderBoxList() {
        const list = document.getElementById('box-list'); list.innerHTML = '';
        Object.keys(db.boxes).forEach(id => {
            const b = db.boxes[id];
            const div = document.createElement('div'); 
            div.className = `box-item ${id === currentBoxId ? 'active' : ''}`;
            // 渲染列表项：包含名称、规格标签和删除按钮
            div.innerHTML = `
                <div class="box-info">${b.name} <span class="box-tag">${b.rows}x${b.cols}</span></div>
                <div class="btn-delete-box" onclick="deleteBox('${id}', event)" title="删除此容器">×</div>
            `;
            div.onclick = () => { searchHighlightPos = null; switchBox(id); }; 
            list.appendChild(div);
        });
    }

    function switchBox(id) {
        currentBoxId = id; selectedPositions.clear();
  updateCellInfo(null);
        document.getElementById('empty-tip').style.display = 'none';
        renderGrid(); renderBoxList(); updatePanel();
    }

    // ========= 核心业务逻辑：网格渲染与交互 =========
    /**
     * 渲染当前容器的网格视图。
     * - 根据 rows/cols 生成网格 DOM
     * - 对已占用格子渲染抗体摘要（名称/克隆号）
     * - 为格子绑定：点击选中、拖拽、悬停提示
     */
    function renderGrid() {
        const grid = document.getElementById('grid'); grid.innerHTML = '';
        if (!currentBoxId) return;
        const box = db.boxes[currentBoxId];
        // 根据容器列数动态设置网格布局
        grid.style.gridTemplateColumns = `repeat(${box.cols}, var(--cell-size))`;

        // 双重循环渲染所有格子
        for (let r = 1; r <= box.rows; r++) {
            for (let c = 1; c <= box.cols; c++) {
                const pos = `${r}-${c}`;
                const v = box.vials[pos];
                const el = document.createElement('div');
                el.id = `cell-${pos}`;
                el.className = 'cell';

                if (v && v.name) {
                    // 渲染已占用格子
                    el.classList.add('occupied'); 
                    el.style.backgroundColor = stringToHslColor(v.vendor || v.host || v.name); // 应用动态颜色
                    el.title = `位置: ${pos}
抗体: ${v.name}
克隆号: ${v.p || '-'}
供应商: ${v.vendor || '-'}
货号: ${v.catalog || '-'}
浓度: ${v.conc || '-'}
kDa: ${v.kda || '-'}
宿主: ${v.host || '-'}
入库日期: ${v.date || '-'}
备注: ${(v.remark || '').slice(0, 120) || '-'}`; // 悬停提示
                    el.innerHTML = `<div class="cell-name">${(v.name || '').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>`
                    + `<div class="cell-clone">${(v.p || '').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>`;
                    // 启用拖拽起始
                    el.setAttribute('draggable', 'true');
                    el.addEventListener('dragstart', (e) => handleDragStart(e, pos)); 
                    el.addEventListener('dragend', handleDragEnd);
                } else {
                    // 渲染空格子
                    el.innerText = pos;
                    // 启用拖拽放置目标
                    el.addEventListener('dragover', handleDragOver);
                    el.addEventListener('dragenter', function() { this.classList.add('drag-over'); });
                    el.addEventListener('dragleave', function() { this.classList.remove('drag-over'); });
                    el.addEventListener('drop', (e) => handleDrop(e, pos));
                }

                // 应用选中和高亮状态
                if (selectedPositions.has(pos)) el.classList.add('selected');
                if (searchHighlightPos === pos) el.classList.add('highlight-target');
                
                // 点击事件处理
                el.addEventListener('click', () => { searchHighlightPos = null; toggleSelect(pos); });
                grid.appendChild(el);
            }
        }
    }

    // ========= 辅助功能模块：颜色生成 =========
    // 根据字符串生成唯一的柔和 HSL 颜色
    function stringToHslColor(str) { 
        let hash = 0; 
        for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash); 
        return `hsl(${hash % 360}, 60%, 88%)`; 
    }

    // ========= 辅助功能模块：拖拽逻辑 (Drag & Drop) =========
    function handleDragStart(e, pos) { 
        draggedItemPos = pos; 
        e.dataTransfer.effectAllowed = 'move'; 
        e.target.style.opacity = '0.5'; 
    }
    function handleDragEnd(e) { 
        e.target.style.opacity = '1'; 
        document.querySelectorAll('.cell').forEach(el => el.classList.remove('drag-over')); 
    }
    function handleDragOver(e) { 
        e.preventDefault(); 
        e.dataTransfer.dropEffect = 'move'; 
        return false; 
    }
    function handleDrop(e, targetPos) { 
        e.stopPropagation(); 
        if (draggedItemPos === targetPos) return; 
        const box = db.boxes[currentBoxId]; 
        if (box.vials[targetPos]) { alert("无法移动：目标位置已有抗体。请先清空目标位置。"); return; } 
        // 执行移动操作
        box.vials[targetPos] = box.vials[draggedItemPos]; 
        delete box.vials[draggedItemPos]; 
        save(); renderGrid(); 
        // 如果移动的是选中的格子，清理选中状态
        if (selectedPositions.has(draggedItemPos)) { selectedPositions.clear();
  updateCellInfo(null); updatePanel(); } 
    }

    // ========= 辅助功能模块：面板交互与数据更新 =========
    function toggleSelect(pos) { 
        if (selectedPositions.has(pos)) selectedPositions.delete(pos); 
        else selectedPositions.add(pos); 
        renderGrid(); updatePanel();
  const box=db.boxes[currentBoxId];
  updateCellInfo(box.vials[pos]||null,pos,box); 
    }
    /**
     * 将右侧面板（或表单）中的输入值写回到当前选中格子的对象中。
     * - 该函数不会主动保存 db；调用者需要在合适时机调用 save()
     */
    function escapeHtml(s){
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function updateCellInfo(v, pos, box){
  const el = document.getElementById('cell-info-content');
  if(!el) return;
  if(!v || !v.name){
    el.textContent = '未选择格子';
    return;
  }
  let rem = '-';
  try{
    const r = calcRemaining(v);
    if(r.ok){
      const u = (v.amountUnit && v.amountUnit !== 'Unknown') ? v.amountUnit : '';
      rem = (r.remaining.toFixed(2) + (u ? (' ' + u) : ''));
    }
  }catch(e){}

  const boxName = box && box.name ? box.name : '-';
  const unit = (v.amountUnit && v.amountUnit !== 'Unknown') ? v.amountUnit : '';
  const thr = (v.warnThreshold !== undefined && v.warnThreshold !== null && String(v.warnThreshold).trim() !== '')
      ? (escapeHtml(v.warnThreshold) + (unit ? (' ' + unit) : ''))
      : '-';

  el.innerHTML = [
    `<div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">`,
    `<div><span style="color:var(--muted);">容器：</span><b>${escapeHtml(boxName)}</b></div>`,
    `<div><span style="color:var(--muted);">位置：</span><b>${escapeHtml(pos || '-')}</b></div>`,
    `</div>`,
    `<hr style="border:none;border-top:1px solid var(--border);margin:10px 0;">`,
    `<div style="margin:3px 0;"><span style="color:var(--muted);">名称：</span><b>${escapeHtml(v.name)}</b></div>`,
    `<div style="margin:3px 0;"><span style="color:var(--muted);">克隆号：</span>${escapeHtml(v.p || '-')}</div>`,
    `<div style="margin:3px 0;"><span style="color:var(--muted);">供应商：</span>${escapeHtml(v.vendor || '-')}</div>`,
    `<div style="margin:3px 0;"><span style="color:var(--muted);">货号：</span>${escapeHtml(v.catalog || '-')}</div>`,
    `<div style="margin:3px 0;"><span style="color:var(--muted);">批号：</span>${escapeHtml(v.lot || '-')}</div>`,
    `<div style="margin:3px 0;"><span style="color:var(--muted);">宿主/同型：</span>${escapeHtml((v.host||'-') + (v.isotype ? (' ' + v.isotype) : ''))}</div>`,
    `<div style="margin:3px 0;"><span style="color:var(--muted);">偶联：</span>${escapeHtml(v.conjugate || '-')}</div>`,
    `<div style="margin:3px 0;"><span style="color:var(--muted);">浓度：</span>${escapeHtml(v.conc || '-')}</div>`,
    `<div style="margin:3px 0;"><span style="color:var(--muted);">kDa：</span>${escapeHtml(v.kda || '-')}</div>`,
    `<div style="margin:3px 0;"><span style="color:var(--muted);">保存条件：</span>${escapeHtml(v.storage || '-')}</div>`,
    `<div style="margin:3px 0;"><span style="color:var(--muted);">到期：</span>${escapeHtml(v.expiry || '-')}</div>`,
    `<div style="margin:3px 0;"><span style="color:var(--muted);">估算剩余：</span><b>${escapeHtml(rem)}</b></div>`,
    `<div style="margin:3px 0;"><span style="color:var(--muted);">阈值：</span>${thr}</div>`,
    `<hr style="border:none;border-top:1px solid var(--border);margin:10px 0;">`,
    `<div style="white-space:pre-wrap;color:var(--text);"><span style="color:var(--muted);">备注：</span>${escapeHtml(v.remark || '')}</div>`
  ].join('');
}

function updatePanel() {
        document.getElementById('sel-count').innerText = selectedPositions.size;
        // 如果仅选中一个，回显其数据
        if (selectedPositions.size === 1) {
            const pos = Array.from(selectedPositions)[0];
            const data = db.boxes[currentBoxId].vials[pos] || {};
            document.getElementById('cell-name').value = data.name || '';
            document.getElementById('cell-p').value = data.p || '';
            document.getElementById('cell-date').value = data.date || '';
            if (document.getElementById('ab-vendor')) document.getElementById('ab-vendor').value = data.vendor || '';
            if (document.getElementById('ab-catalog')) document.getElementById('ab-catalog').value = data.catalog || '';

            if (document.getElementById('ab-lot')) document.getElementById('ab-lot').value = data.lot || '';
            if (document.getElementById('ab-host')) document.getElementById('ab-host').value = data.host || '';
            if (document.getElementById('ab-isotype')) document.getElementById('ab-isotype').value = data.isotype || '';
            if (document.getElementById('ab-conjugate')) document.getElementById('ab-conjugate').value = data.conjugate || '';
            if (document.getElementById('ab-conc')) document.getElementById('ab-conc').value = data.conc || '';
            if (document.getElementById('ab-kda')) document.getElementById('ab-kda').value = data.kda || '';
            if (document.getElementById('ab-remark')) document.getElementById('ab-remark').value = data.remark || '';

            if (document.getElementById('ab-qty-removed')) document.getElementById('ab-qty-removed').value = data.qty || 1;

            if (document.getElementById('ab-amount')) document.getElementById('ab-amount').value = data.amount || '';
            if (document.getElementById('ab-amount-unit')) document.getElementById('ab-amount-unit').value = data.amountUnit || '';
            if (document.getElementById('ab-use-per')) document.getElementById('ab-use-per').value = data.usePer || '';
            if (document.getElementById('ab-used-count')) document.getElementById('ab-used-count').value = data.usedCount || '0';
            if (document.getElementById('ab-warn-threshold')) document.getElementById('ab-warn-threshold').value = data.warnThreshold || '';
            updateRemainingUI();
            if (document.getElementById('ab-storage')) document.getElementById('ab-storage').value = data.storage || '';
            if (document.getElementById('ab-expiry')) document.getElementById('ab-expiry').value = data.expiry || '';
        }
        updateLiveStats();
    }
    // 实时计算全库存量并触发预警样式
    function updateLiveStats() {
        const name = document.getElementById('cell-name').value.trim().toLowerCase();
        const totalSpan = document.getElementById('total-inventory');
        const statsArea = document.getElementById('stats-area');
        if (!name) { totalSpan.innerText = '0'; statsArea.classList.remove('stats-danger'); return; }
        let count = 0;
        Object.values(db.boxes).forEach(b => {
            Object.values(b.vials).forEach(v => { if (v.name && v.name.toLowerCase() === name) count++; });
        });
        totalSpan.innerText = count;
        if (count > 0 && count <= 3) statsArea.classList.add('stats-danger'); else statsArea.classList.remove('stats-danger');
    }
    
    // ========= 核心业务逻辑：数据存取 (入库/出库) =========
    function saveBatch() {
        if (!currentBoxId || selectedPositions.size === 0) return alert("请先选择格子");
        const name = document.getElementById('cell-name').value.trim(); if (!name) return alert("抗体名称必填");
                const data = {
            name,
            p: document.getElementById('cell-p').value,
            date: document.getElementById('cell-date').value,
            vendor: document.getElementById('ab-vendor')?.value || '',
            catalog: document.getElementById('ab-catalog')?.value || '',
            lot: document.getElementById('ab-lot')?.value || '',
            conc: document.getElementById('ab-conc')?.value || '',
            kda: document.getElementById('ab-kda')?.value || '',
            host: document.getElementById('ab-host')?.value || '',
            isotype: document.getElementById('ab-isotype')?.value || '',
            conjugate: document.getElementById('ab-conjugate')?.value || '',
            storage: document.getElementById('ab-storage')?.value || '',
            expiry: document.getElementById('ab-expiry')?.value || '',
            amount: document.getElementById('ab-amount')?.value || '',
            amountUnit: document.getElementById('ab-amount-unit')?.value || '',
            usePer: document.getElementById('ab-use-per')?.value || '',
            usedCount: document.getElementById('ab-used-count')?.value || '0',
            warnThreshold: document.getElementById('ab-warn-threshold')?.value || '',
            remark: document.getElementById('ab-remark')?.value || ''
        };

        selectedPositions.forEach(pos => db.boxes[currentBoxId].vials[pos] = {...data});
        selectedPositions.clear();
  updateCellInfo(null); // 保存后自动取消选择
        save(); renderGrid(); updatePanel(); updateWarningBoard();
    }
    function clearBatch() {
        if (!selectedPositions.size || !confirm("确定要清空所选位置吗？(出库动作)")) return;
        selectedPositions.forEach(pos => delete db.boxes[currentBoxId].vials[pos]);
        selectedPositions.clear();
  updateCellInfo(null); // 出库后自动取消选择
        save(); renderGrid(); updatePanel(); updateWarningBoard();
    }

    // ========= 辅助功能模块：全局搜索与预警（抗体） =========
    function handleGlobalSearch() {
        const term = document.getElementById('global-search').value.toLowerCase().trim();
        const dropdown = document.getElementById('search-dropdown');
        if (!term) { dropdown.style.display = 'none'; return; }
        let matches = [];
        Object.keys(db.boxes).forEach(boxId => {
            const box = db.boxes[boxId];
            Object.keys(box.vials).forEach(pos => {
                const v = box.vials[pos];
                const hay = [v.name, v.p, v.vendor, v.catalog, v.lot, v.conc, v.kda, v.host, v.isotype, v.conjugate, v.storage, v.expiry, String(v.qty||''), v.remark].filter(Boolean).join(' ').toLowerCase();
                if (hay.includes(term)) matches.push({ boxId, boxName: box.name, pos, name: v.name, p: v.p, vendor: v.vendor, catalog: v.catalog, host: v.host });
            });
        });
        dropdown.innerHTML = matches.length ? matches.map(m => `
            <div class="search-item" onclick="jumpToVial('${m.boxId}', '${m.pos}')">
                <div><strong>${m.name}</strong> <small style="color:#888">(Clone: ${m.p||'-'})</small></div>
                <div style="color:#666; font-size:12px; margin-top:2px;">${m.vendor||''}${(m.vendor && m.catalog) ? ' · ' : ''}${m.catalog||''}${(m.host) ? ' · 宿主: ' + m.host : ''}</div>
                <div class="loc-tag">${m.boxName} [${m.pos}]</div>
            </div>`).join('') : '<div style="padding:15px; color:#999;">未找到匹配抗体</div>';
        dropdown.style.display = 'block';
    }
    // 跳转并高亮目标格子
    function jumpToVial(boxId, pos) {
        document.getElementById('search-dropdown').style.display = 'none';
        document.getElementById('global-search').value = '';
        searchHighlightPos = pos; switchBox(boxId);
        setTimeout(() => { const el = document.getElementById(`cell-${pos}`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 200);
    }
    // 更新全局低库存预警看板
    function updateWarningBoard() {
        const board = document.getElementById('global-warning-list');
        if (!board) return;

        const warnings = [];
        Object.values(db.boxes).forEach(box => {
            Object.entries(box.vials || {}).forEach(([pos, v]) => {
                if (!v || !v.name) return;

                // 仅按“每个抗体自定义的余量预警阈值”触发低库存预警
                const thr = parseFloat(v.warnThreshold ?? '');
                if (isNaN(thr)) return;

                const r = calcRemaining(v);
                if (!r.ok) return;

                if (r.remaining <= thr) {
                    warnings.push({
                        name: v.name,
                        vendor: v.vendor || '',
                        boxName: box.name,
                        pos,
                        remaining: r.remaining,
                        unit: v.amountUnit || '',
                        threshold: thr
                    });
                }
            });
        });

        warnings.sort((a, b) => a.remaining - b.remaining);

        board.innerHTML = warnings.length
            ? warnings.map(w => `
                <div style="padding:8px; border-bottom:1px solid #eee;">
                    <div style="display:flex; justify-content:space-between; gap:8px;">
                        <span><b>${w.name}</b>${w.vendor ? ` <span style="color:#888;">(${w.vendor})</span>` : ''}</span>
                        <b style="color:var(--danger)">${w.remaining.toFixed(2)} ${w.unit || ''}</b>
                    </div>
                    <div style="display:flex; justify-content:space-between; color:#888; margin-top:2px;">
                        <span>${w.boxName} · ${w.pos}</span>
                        <span>阈值 ${w.threshold}</span>
                    </div>
                </div>
            `).join('')
            : '<div style="color:#ccc; text-align:center;">✅ 暂无低库存预警（仅对已设置阈值的抗体生效）</div>';
    }

    // ========= 数据持久化与导入导出 =========
    function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); }
    /**
     * 导出当前数据库为 JSON 文件（浏览器下载）。
     * 用途：备份/迁移/跨设备同步（手动）。
     */
    function exportDB() {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(db)], {type: 'application/json'}));
        a.download = `Antibody_Storage_Backup_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
    }
    
    function triggerImport() { document.getElementById('import-file').click(); }
    /**
     * 从用户选择的 JSON 文件导入数据库。
     * - 进行基本结构校验
     * - 覆盖写入 localStorage（导入即替换）
     */
    function importDB(e) {
        const reader = new FileReader();
        reader.onload = function(ev) {
            try {
                const data = JSON.parse(ev.target.result);
                if (data.boxes) { db = data; init(); save(); alert("数据导入成功！"); }
                else alert("文件格式错误，非有效的备份文件。");
            } catch (err) { alert("导入失败，文件可能已损坏。"); }
        };
        reader.readAsText(e.target.files[0]);
        e.target.value = ''; // 重置 input file 以便下次重复导入同一文件
    }

    // 点击外部关闭搜索下拉框
    document.addEventListener('click', (e) => { if (!e.target.closest('.search-wrapper')) document.getElementById('search-dropdown').style.display = 'none'; });
    
    // 启动应用
    init();
