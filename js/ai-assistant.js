import { AppConfig } from './config.js';
import { Storage } from './storage.js';
import { Auth } from './auth.js';
import { DataService } from './data.js';
// ============================================================
// AI ASSISTANT MODULE (Using Gemini API)
// ============================================================

export const AIAssistant = {
  chatHistory: [],
  baseSystemInstruction: `SYSTEM PROMPT - Trợ lý Kỹ thuật Vô tuyến Nokia & ZTE 4G/5G
1. VAI TRÒ
Bạn là Anh Ba - một trợ lý kỹ thuật AI thân thiện, am hiểu sâu và luôn sẵn sàng hỗ trợ các kỹ thuật viên/kỹ sư RF, tối ưu mạng và vận hành trạm viễn thông.
Bạn BẮT BUỘC trả lời hoàn toàn bằng tiếng Việt, sử dụng thuật ngữ kỹ thuật viễn thông quen thuộc của kỹ sư Việt Nam
"KHÔNG ĐƯỢC trả lời bằng tiếng Anh. KHÔNG tự ý dịch thô các thuật ngữ chuyên ngành quen thuộc (giữ nguyên các từ như Feeder, Jumper, Sector, Tilt, Connector, Azimuth, Alarms)."

Bạn đồng hành cùng người dùng để:
• Giải thích tham số vô tuyến Nokia và ZTE (LTE FDD/TDD, 5G NR NSA/SA) - cơ chế hoạt động, không chỉ tra số.
• Tra cứu, phân tích và gợi ý hướng xử lý lỗi/cảnh báo trạm (alarm/fault).
• Hỗ trợ xử lý các vấn đề kỹ thuật phát sinh trong vận hành mạng lưới hàng ngày.
Phong cách: gần gũi, dễ hiểu, kiên nhẫn - như một người anh đồng nghiệp kỹ thuật giàu kinh nghiệm sẵn sàng giải thích lại nếu cần, không hách dịch, không giáo điều. Vẫn giữ độ chính xác và chặt chẽ kỹ thuật ở mức cao nhất.
Người dùng có thể là kỹ sư chuyên sâu hoặc kỹ thuật viên hiện trường - bạn chủ động điều chỉnh độ sâu giải thích theo câu hỏi: nếu người dùng hỏi nhanh một giá trị, trả lời gọn; nếu hỏi "tại sao", đi vào cơ chế kỹ thuật.
________________________________________
2. PHẠM VI CHUYÊN MÔN
Quan trọng: Nokia và ZTE là hai vendor được ưu tiên hàng đầu trong mọi câu trả lời, đối chiếu và khuyến nghị.
• Nokia LTE/5G NR: cấu trúc tham số theo object (LNCEL, LNBTS, LNADJ, LNADJL, LNHOIF, MODPR, CADC, NRCELL, NRBTS, NRDCELLGRP, NRREL...), tham số EN-DC B1/B1+SgNB, SA threshold, mô hình tham số NetAct.
• ZTE LTE/5G NR: cấu trúc tham số theo object (EUtranCellFDD/TDD, ENodeBFunction, GNBCUCPFunction, GNBDUFunction, NRCellDU/CU, các bảng MO tương ứng trên UME), logic HO, ICIC, power control, EN-DC theo chuẩn ZTE.
• Đối chiếu Nokia ↔ ZTE: khi người dùng cần so sánh tham số/logic giữa hai vendor, luôn ưu tiên trình bày cặp đối chiếu này trước, có thể bổ sung Ericsson/Huawei nếu được hỏi thêm.
• Domain kỹ thuật: Accessibility, Retainability, Mobility (HO/reselection), Integrity (throughput/CA), Coverage/Capacity tradeoff, Idle mode, VoLTE/QCI1, Load balancing, Power control, ICIC/eICIC.
• Tra cứu lỗi trạm: alarm code, mức độ nghiêm trọng (critical/major/minor/warning), nguyên nhân thường gặp, hướng kiểm tra/xử lý, phân biệt lỗi phần cứng/truyền dẫn/tham số/phần mềm.
• Hỗ trợ xử lý vấn đề kỹ thuật: sự cố rớt sóng, mất kết nối, KPI tụt, cell tồi, vùng lõm, nhiễu, drift tham số sau thay đổi cấu hình...
________________________________________
3. NGUYÊN TẮC GIẢI THÍCH THAM SỐ
• Cấu trúc trả lời 3 phần: [Định nghĩa ngắn gọn] -> [Cơ chế hoạt động thực tế] -> [Khuyến nghị/Impact khi thay đổi].
• Phân tích tác động: Không chỉ nói "tăng là tốt", phải nói "tăng thì cải thiện X nhưng rủi ro Y". Ví dụ: tăng tilt cải thiện overshooting nhưng có thể tạo lỗ hổng vùng phủ (coverage hole).
• Dùng số liệu minh họa: Nếu có thể, hãy đưa ví dụ cụ thể (vd: "nếu RsrpThreshold = -110dBm thay vì -115dBm thì...").
________________________________________
4. NGUYÊN TẮC XỬ LÝ LỖI (TROUBLESHOOTING)
• Cách tiếp cận phân lớp: Hardware/Tx -> Logic/Parameter -> External (Nhiễu, che chắn). Luôn đi từ cơ bản (có điện, có truyền dẫn không) đến phức tạp (nhiễu PIM, VSWR, cấu hình sai).
• Đọc log/alarm: Nếu người dùng gửi mã alarm, phải dịch ra ý nghĩa, chỉ ra thiết bị/module có khả năng lỗi (RRU, BBU, quang, nguồn) và các bước cô lập lỗi (vd: "đảo thử sợi quang", "đo suy hao", "check port").
• Nhấn mạnh an toàn: Nếu cần thay thế phần cứng (đặc biệt nguồn, cáp quang), luôn nhắc nhở nguyên tắc an toàn cơ bản của nhà mạng.
________________________________________
5. XỬ LÝ KHI KHÔNG CHẮC CHẮN HOẶC THIẾU THÔNG TIN
• Không bịa đặt: Nếu không nhớ chính xác một tham số vendor-specific hoặc alarm code hiếm gặp, HÃY nói rõ: "Mình không có dữ liệu chính xác 100% về mã lỗi này của vendor X, nhưng thông thường nó liên quan đến...".
• Phân biệt rõ 3 loại phát biểu khi cần: 
o [Chuẩn] – theo tài liệu/spec, chắc chắn.
o [Suy luận] – diễn giải kỹ thuật cần xác nhận bằng số liệu thực tế.
o [Cần dữ liệu] – thiếu input, nêu rõ cần gì (KPI hiện tại, dump tham số, kết quả DT/log alarm...).
• Khuyến nghị giá trị luôn kèm điều kiện áp dụng và KPI để verify.
________________________________________
6. NGUYÊN TẮC TRIỂN KHAI THAY ĐỔI
• Không khuyến nghị đổi tham số diện rộng ngay. Quy trình chuẩn: làm mẫu (cluster/site nhỏ) -> đo KPI before/after -> đánh giá -> mới rollout.
• Mỗi khuyến nghị đổi tham số đi kèm KPI verify cụ thể (tên KPI + chiều kỳ vọng) và chỉ báo rollback (KPI nào xấu đi thì revert).
• Nếu đổi tham số A bắt buộc kiểm tra/đồng bộ tham số B -> phải nêu rõ ràng buộc chéo này.
________________________________________
7. XỬ LÝ KHI CÓ "DỮ LIỆU KỸ THUẬT" ĐƯỢC CUNG CẤP
Nếu trong ngữ cảnh cuộc trò chuyện có phần "Dữ liệu kỹ thuật" hoặc người dùng đã cung cấp tài liệu kỹ thuật trước đó:
• Ưu tiên sử dụng nội dung từ tài liệu này làm nguồn tham khảo chính khi trả lời các câu hỏi liên quan.
• Khi sử dụng thông tin từ tài liệu, có thể dẫn chiếu ngắn gọn như: "theo tài liệu bạn cung cấp" hoặc "theo dữ liệu kỹ thuật được cung cấp".
• Chỉ sử dụng những nội dung thực sự có trong tài liệu hoặc ngữ cảnh hiện tại; không suy diễn hoặc khẳng định những thông tin không được cung cấp.
• Nếu người dùng hỏi về nội dung đã xuất hiện trong ngữ cảnh hoặc tài liệu đã được chia sẻ trong cuộc trò chuyện, xác nhận rằng đã tiếp nhận và có thể hỗ trợ dựa trên các thông tin đó.
• Nếu tài liệu không chứa đủ dữ liệu để đưa ra kết luận chính xác, cần:
o Nêu rõ phần thông tin còn thiếu.
o Giải thích giới hạn của phân tích hiện tại.
o Đề xuất dữ liệu hoặc tài liệu cần bổ sung để tiếp tục đánh giá.
• Khi có sự khác biệt giữa kiến thức chung và tài liệu người dùng cung cấp, ưu tiên phân tích dựa trên tài liệu, đồng thời nêu rõ nếu phát hiện điểm chưa nhất quán hoặc cần xác minh thêm.
________________________________________
8. BỐI CẢNH MẠNG (mặc định khi khuyến nghị)
• Địa hình đa dạng: đô thị dày (TP.HCM, Cần Thơ, Biên Hòa), nông thôn ĐBSCL, biên giới (An Giang, Đồng Tháp), Cà Mau sông nước, khu công nghiệp, indoor/IBS.
• Đang chạy LTE đa band + 5G NSA EN-DC; lộ trình 2G shutdown; rollout 5G.
• Ưu tiên KPI vận hành: CSSR, Drop Call Rate, CDR, HOSR, PRB utilization, user/cell throughput, VoLTE quality, vùng lõm.
• Mục tiêu thường gặp: giảm cell tồi tốc độ, xử lý vùng lõm, cân bằng tải, ổn định mobility biên cell/vùng overlap cao, xử lý nhanh alarm trạm.
• Swap vendor
________________________________________
9. ĐỊNH DẠNG TRẢ LỜI
• Trả lời thân thiện, ngắn gọn, dễ hiểu, tự nhiên như trò chuyện với đồng nghiệp; vẫn có thể mở đầu bằng kết luận/khuyến nghị trước rồi mới giải thích chi tiết.
• Dùng bullet hoặc bảng khi cần so sánh nhiều tham số/giá trị/lỗi, không lạm dụng định dạng khi câu trả lời đơn giản.
• Tên object/tham số Nokia và ZTE viết chính xác, dùng code style để dễ tra trên hệ thống quản lý.
• Sẵn sàng hỏi lại nếu câu hỏi chưa rõ, nhưng không hỏi dồn nhiều câu một lúc – ưu tiên trả lời được phần nào trước, hỏi thêm phần còn thiếu.
________________________________________
10. KHI THIẾU DỮ LIỆU
Nếu câu hỏi thiếu context để trả lời chính xác, hỏi (tối đa, chỉ hỏi đúng phần cần):
• Vendor (Nokia/ZTE) và loại object/tham số cụ thể.
• Loại khu vực (đô thị/nông thôn/biên giới/indoor).
• KPI hiện trạng hoặc vấn đề/alarm đang gặp.
• Band/cấu hình (FDD/TDD, NSA/SA), release/version nếu có.
Không đoán bừa khi thiếu sự cố – nêu rõ cần thêm thông tin gì.`,
  systemInstruction: "",

  init() {
    this.systemInstruction = this.baseSystemInstruction;
    this.modal = document.getElementById('ai-chat-overlay');
    // Support both old and new close button ids
    this.closeBtn = document.getElementById('ai-close-btn') || document.querySelector('#ai-chat-overlay .modal-close');
    this.sendBtn = document.getElementById('ai-send-btn');
    this.uploadBtn = document.getElementById('ai-upload-btn');
    this.uploadSheet = document.getElementById('ai-upload-sheet');
    this.btnCamera = document.getElementById('ai-btn-camera');
    this.btnGallery = document.getElementById('ai-btn-gallery');
    this.imageInputGallery = document.getElementById('ai-image-input-gallery');
    this.imageInputCamera = document.getElementById('ai-image-input-camera');
    this.textInput = document.getElementById('ai-text-input');
    this.historyDiv = document.getElementById('ai-chat-history');

    this.closeBtn?.addEventListener('click', () => this.closeChat());
    this.sendBtn?.addEventListener('click', () => this.sendMessage());
    
    // Toggle action sheet
    this.uploadBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.uploadSheet) {
        this.uploadSheet.style.display = this.uploadSheet.style.display === 'none' ? 'flex' : 'none';
      }
    });
    
    // Hide action sheet when clicking outside
    document.addEventListener('click', (e) => {
      if (this.uploadSheet && e.target !== this.uploadBtn && !this.uploadBtn.contains(e.target)) {
        this.uploadSheet.style.display = 'none';
      }
    });
    
    this.btnCamera?.addEventListener('click', () => {
      this.imageInputCamera?.click();
      if (this.uploadSheet) this.uploadSheet.style.display = 'none';
    });
    
    this.btnGallery?.addEventListener('click', () => {
      this.imageInputGallery?.click();
      if (this.uploadSheet) this.uploadSheet.style.display = 'none';
    });
    
    const handleImg = (e) => this.handleImageSelect(e);
    this.imageInputGallery?.addEventListener('change', handleImg);
    this.imageInputCamera?.addEventListener('change', handleImg);
    this.textInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Show welcome message if chat is empty
    if (this.historyDiv && !this.historyDiv.querySelector('.ai-bubble')) {
      this.historyDiv.innerHTML = `<div class="ai-bubble ai" style="background:rgba(0,210,255,0.08);border:1px solid rgba(0,210,255,0.2);color:#a0e4f1;font-size:14px;">
        🤖 Xin chào! Tôi là <strong>Anh Ba</strong> - trợ lý kỹ thuật.<br>
        Tôi có thể giúp bạn tra cứu lỗi trạm, hướng dẫn xử lý sự cố hoặc trả lời câu hỏi kỹ thuật.<br><small style="color:rgba(0,210,255,0.6);">Hãy nhập câu hỏi hoặc gửi ảnh để bắt đầu.</small>
      </div>`;
    }

    this.loadHistory();

    // Kho tài liệu KHÔNG tải lúc mở app: lần đọc đầu ở backend phải OCR file PDF/ảnh,
    // mất hàng chục giây và làm mọi phiên đăng nhập đều dính lỗi timeout dù người dùng
    // không hề định hỏi AI. Dùng ngay bản đã lưu, chỉ gọi server khi mở khung chat.
    const cachedText = localStorage.getItem('bts_ai_knowledge_text');
    if (cachedText) {
      this.systemInstruction = this.baseSystemInstruction + "\n\nDỮ LIỆU KỸ THUẬT TỪ HỆ THỐNG:\n" + cachedText;
    }
  },

  async fetchKnowledgeBase() {
    try {
      const nm = document.getElementById("ai-name-text");
      const result = await window.DataService.getAIKnowledge();

      if (!result) return;

      if (!result.success) {
        // Không toast lỗi: AI vẫn trả lời được bằng kho tài liệu đã lưu, và lần đọc
        // sau (backend đã cache xong) sẽ tự có bản mới. Báo đỏ ở tên trợ lý là đủ để
        // biết đang chạy bằng dữ liệu cũ, không cần chặn người dùng bằng thông báo.
        console.warn('[AI] Không nạp được kho tài liệu:', result.error);
        if (nm) nm.style.color = "#f59e0b";
        const cachedText = localStorage.getItem('bts_ai_knowledge_text');
        if (cachedText) {
          this.systemInstruction = this.baseSystemInstruction + "\n\nDỮ LIỆU KỸ THUẬT TỪ HỆ THỐNG:\n" + cachedText;
        }
        return;
      }

      if (result.errors && result.errors.length > 0) {
        window.App.showToast("Cảnh báo AI: " + result.errors[0], "warning");
      }

      // Success -> turn green!
      if (nm) nm.style.color = "#22c55e";

      let imageInstruction = "";
      if (result.images && result.images.length > 0) {
        imageInstruction = "\n\n[MỆNH LỆNH BẮT BUỘC TỪ HỆ THỐNG]: BẠN CÓ THƯ VIỆN ẢNH SAU ĐÂY:\n";
        result.images.forEach(img => {
          imageInstruction += `- ${img.name} (Link: ${img.url})\n`;
        });
        imageInstruction += "\nTrình duyệt của người dùng có khả năng tự động biến đổi chuỗi chữ Markdown thành Hình ảnh. Bạn LÀ MỘT AI CHỈ TRẢ LỜI TEXT, nhưng bạn CÓ THỂ hiển thị ảnh bằng cách GÕ ĐÚNG CHUỖI TEXT SAU: ![Tên ảnh](Link). KHÔNG BAO GIỜ được nói 'Tôi không thể gửi ảnh'. Khi người dùng hỏi về sơ đồ, bạn BẮT BUỘC phải gõ chuỗi chữ ![Tên ảnh](Link) tương ứng vào câu trả lời, trình duyệt sẽ lo phần còn lại.";
      }

      let extraKnowledge = "";
      if (result.status === 'not_modified') {
        const cachedText = localStorage.getItem('bts_ai_knowledge_text');
        if (cachedText) extraKnowledge = "\n\nDỮ LIỆU KỸ THUẬT TỪ HỆ THỐNG:\n" + cachedText;
      } else if (result.status === 'updated') {
        if (result.text) {
          extraKnowledge = "\n\nDỮ LIỆU KỸ THUẬT TỪ HỆ THỐNG:\n" + result.text;
          localStorage.setItem('bts_ai_knowledge_text', result.text);
          localStorage.setItem('bts_ai_knowledge_hash', result.hash || '');
        } else {
          localStorage.setItem('bts_ai_knowledge_text', '');
          localStorage.setItem('bts_ai_knowledge_hash', result.hash || '');
        }
      }

      this.systemInstruction = this.baseSystemInstruction + imageInstruction + extraKnowledge;

    } catch (e) {
      console.error(e);
      window.App.showToast("Lỗi tải AI Knowledge: " + e.message, "error");
    }
  },

  openChat() {
    this.modal.classList.add('visible');
    // Nạp kho tài liệu 1 lần cho mỗi phiên, ngay lúc người dùng thật sự cần đến AI.
    if (!this._knowledgeRequested) {
      this._knowledgeRequested = true;
      this.fetchKnowledgeBase();
    }
  },
  closeChat() {
    this.modal.classList.remove('visible');
  },
  toggleChat() {
    if (this.modal.classList.contains('visible')) {
      this.closeChat();
    } else {
      this.openChat();
    }
  },

  showZoomableImage(imageUrl) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); z-index:9999; display:flex; align-items:center; justify-content:center; flex-direction:column; touch-action:none;';
    
    const closeBtn = document.createElement('div');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText = 'position:absolute; top:20px; right:20px; color:white; font-size:40px; cursor:pointer; width:50px; height:50px; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.1); border-radius:50%; z-index:10000;';
    closeBtn.onclick = () => overlay.remove();

    const bigImg = document.createElement('img');
    bigImg.src = imageUrl;
    bigImg.style.cssText = 'max-width:95vw; max-height:95vh; object-fit:contain; border-radius:8px; box-shadow:0 10px 40px rgba(0,0,0,0.5); cursor:grab;';
    
    bigImg.onclick = (e) => e.stopPropagation();
    
    overlay.appendChild(closeBtn);
    overlay.appendChild(bigImg);
    
    overlay.onclick = (e) => {
      if(e.target === overlay) overlay.remove();
    };
    document.body.appendChild(overlay);

    if (window.Panzoom) {
      const pz = window.Panzoom(bigImg, { maxScale: 10, minScale: 1, contain: 'outside' });
      bigImg.parentElement.addEventListener('wheel', pz.zoomWithWheel);
      let lastTap = 0;
      bigImg.addEventListener('touchstart', (e) => {
        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTap;
        if (tapLength < 500 && tapLength > 0) {
          pz.zoom(pz.getScale() === 1 ? 3 : 1, { animate: true });
          e.preventDefault();
        }
        lastTap = currentTime;
      });
      bigImg.addEventListener('dblclick', () => {
        pz.zoom(pz.getScale() === 1 ? 3 : 1, { animate: true });
      });
    }
  },

  parseMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%; border-radius:8px; margin-bottom:8px; cursor:pointer; display:block;" onclick="AIAssistant.showZoomableImage(this.src)">')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:#a0e4f1;text-decoration:underline;">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  },

  addBubble(role, text, save = true, imageUrl = null) {
    if (save) {
      const saveText = text || (imageUrl ? '[Đã gửi ảnh]' : '');
      this.chatHistory.push({ role: role === 'user' ? 'user' : 'model', parts: [{ text: saveText }] });
      this.saveHistory();
    }
    const div = document.createElement('div');
    div.className = `ai-bubble ${role}`;
    
    if (imageUrl) {
      const img = document.createElement('img');
      img.src = imageUrl;
      img.style.cssText = 'max-width:100%; border-radius:8px; margin-bottom:8px; cursor:pointer; display:block;';
      img.onclick = () => this.showZoomableImage(imageUrl);
      div.appendChild(img);
    }
    
    if (text) {
      const span = document.createElement('span');
      if (role === 'ai') {
        span.innerHTML = this.parseMarkdown(text);
      } else {
        span.textContent = text;
      }
      div.appendChild(span);
    }
    
    this.historyDiv.appendChild(div);
    this.scrollToBottom();
  },

  scrollToBottom() {
    setTimeout(() => {
      this.historyDiv.scrollTop = this.historyDiv.scrollHeight;
    }, 50);
  },

  async handleImageSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const previewDiv = document.getElementById('ai-image-preview');
    
    const reader = new FileReader();
    reader.onload = (evt) => {
      this.pendingImage = evt.target.result;
      if (previewDiv) {
        previewDiv.innerHTML = `<div style="position:relative;display:inline-block;">
          <img src="${this.pendingImage}" style="height:60px;border-radius:6px;border:1px solid rgba(0,210,255,0.3);">
          <button onclick="AIAssistant.clearPreview()" style="position:absolute;top:-8px;right:-8px;background:#ef4444;color:white;border:none;border-radius:50%;width:22px;height:22px;font-size:14px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 4px rgba(0,0,0,0.5);">×</button>
        </div>`;
        previewDiv.style.display = 'block';
      }
    };
    reader.readAsDataURL(file);
  },

  async sendMessage() {
    try {
      const text = this.textInput.value.trim();
      const imageUrl = this.pendingImage;
      if (!text && !imageUrl) return;

      const apiKey = typeof AppConfig !== 'undefined' ? AppConfig.GEMINI_API_KEY : '';
      if (!apiKey || apiKey.trim() === '') {
        this.addBubble('ai', `Lỗi: Gemini API Key chưa được cấu hình.\n\nVui lòng dán vào file config.js.`);
        return;
      }

      this.textInput.value = '';
      this.clearPreview();
      
      this.addBubble('user', text, true, imageUrl);

      // Loading state
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'ai-bubble ai loading';
      loadingDiv.innerHTML = '<span>.</span><span>.</span><span>.</span>';
      this.historyDiv.appendChild(loadingDiv);
      this.scrollToBottom();

      const parts = [];
      if (text) {
        parts.push({ text: text });
      }
      if (imageUrl) {
        const base64Data = imageUrl.split(',')[1];
        const mimeType = imageUrl.split(';')[0].split(':')[1];
        parts.push({
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        });
      }

      // Add to history temporarily for API call
      const apiHistory = [...this.chatHistory];
      // Update history element to represent user's complex input
      apiHistory[apiHistory.length - 1].parts = parts;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: apiHistory,
          systemInstruction: { parts: [{ text: this.systemInstruction }] },
          generationConfig: { temperature: 0.2, topK: 40, topP: 0.95 }
        })
      });

      loadingDiv.remove();

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'API request failed');
      }

      const data = await response.json();
      const aiText = data.candidates[0].content.parts[0].text;
      
      this.addBubble('ai', aiText);

    } catch (e) {
      console.error(e);
      this.addBubble('ai', `Lỗi kết nối Gemini: ${e.message}`);
    }
  },

  clearPreview() {
    this.pendingImage = null;
    const previewDiv = document.getElementById('ai-image-preview');
    if (previewDiv) {
      previewDiv.style.display = 'none';
      previewDiv.innerHTML = '';
    }
    if (this.imageInputGallery) this.imageInputGallery.value = '';
    if (this.imageInputCamera) this.imageInputCamera.value = '';
  },

  clearHistory() {
    if (confirm('Xóa toàn bộ lịch sử trò chuyện?')) {
      this.chatHistory = [];
      this.saveHistory();
      this.historyDiv.innerHTML = '';
    }
  },

  saveHistory() {
    localStorage.setItem('bts_ai_chat', JSON.stringify(this.chatHistory));
  },

  loadHistory() {
    const saved = localStorage.getItem('bts_ai_chat');
    if (saved) {
      try {
        this.chatHistory = JSON.parse(saved);
        this.chatHistory.forEach(msg => {
          if (msg.role === 'user') {
            this.addBubble('user', msg.parts[0].text, false);
          } else {
            this.addBubble('ai', msg.parts[0].text, false);
          }
        });
      } catch (e) {
        console.error('Lỗi parse lịch sử', e);
      }
    }
  }
};
