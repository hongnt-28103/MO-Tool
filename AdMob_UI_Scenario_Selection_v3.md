**UI SCENARIO SELECTION**

Mapping Configuration Panel --- Spec & Logic

3 UI controls → 6 backend scenarios \| State rules \| Validation \|
Verify checklist

  -----------------------------------------------------------------------
  **UI control**  **Values**               **Dieu kien dac biet**
  --------------- ------------------------ ------------------------------
  Group by        AD_FORMAT \| AD_UNIT     Chon AD_UNIT → auto bat eCPM
                                           Floor, disable checkbox

  eCPM Floor      OFF \| ON                Khi Group by = AD_UNIT: luon
  split                                    ON, khong cho tat

  Country         ALL \| GROUPS            Chon GROUPS: bat buoc nhap \>=
                                           1 country group
  -----------------------------------------------------------------------

**1. Tổng quan: 3 controls → 6 scenarios**

User chi thay 3 lua chon tren UI. Backend nhan 3 gia tri nay va map
xuong 1 trong 6 scenario. Khong co logic \"engine\" phuc tap --- don
gian la look-up table.

> UI (3 controls) BACKEND (6 scenarios)
>
> ─────────────────────────────────────────────────────────────────────
>
> Group by: AD_FORMAT ──┐
>
> AD_UNIT ──┤
>
> │
>
> eCPM Floor: OFF ────────┼──► resolveScenario() ──► S1 \| S2 \| S3 \|
>
> ON ────────┤ S4 \| S5 \| S6
>
> │
>
> Country: ALL ─────────┤
>
> GROUPS ──────┘
>
> Constraint: Group by = AD_UNIT → eCPM Floor force = ON
>
> Constraint: Country = GROUPS → phai co \>= 1 country group

  -----------------------------------------------------------------------------------
  **Group     **eCPM     **Country**   **→          **Mo ta ngan**
  by**        Floor**                  Scenario**   
  ----------- ---------- ------------- ------------ ---------------------------------
  AD_UNIT     ON (auto)  ALL           S1           1 ad unit = 1 group (global)

  AD_FORMAT   OFF        ALL           S2           Gom theo format, bo qua floor
                                                    (global)

  AD_FORMAT   ON         ALL           S3           Gom theo format + floor (global)

  AD_UNIT     ON (auto)  GROUPS        S4           1 ad unit × N country groups

  AD_FORMAT   OFF        GROUPS        S5           Gom theo format, bo qua floor ×
                                                    country groups

  AD_FORMAT   ON         GROUPS        S6           Gom theo format + floor × country
                                                    groups
  -----------------------------------------------------------------------------------

**2. UI State Machine --- 3 controls**

Moi control co the o trang thai: enabled (user chinh duoc) hoac
disabled + forced (gia tri bi khoa, user khong chinh duoc). Cac rang
buoc phat sinh tu lua chon cua user.

**2A. Control: \"Group by\"**

Radio button, 2 gia tri. Lua chon nay anh huong den control eCPM Floor
ben duoi.

  ------------------------------------------------------------------------
  **User chon**   **Hien thi**       **eCPM Floor control thay doi the
                                     nao**
  --------------- ------------------ -------------------------------------
  AD_FORMAT       Radio chon         eCPM Floor: enabled, user chinh duoc
  (default)       AD_FORMAT          

  AD_UNIT         Radio chon AD_UNIT eCPM Floor: DISABLED + forced = ON.
                                     Hien tooltip giai thich.
  ------------------------------------------------------------------------

> RULE RULE UI-G1: Khi Group by = AD_UNIT, eCPM Floor KHONG cho tat. Li
> do: ban chat ad unit da co floor tier embed trong ten
> (native_splash_high). Gom theo ad unit ma khong phan biet floor la vo
> nghia.

**2B. Control: \"eCPM Floor split\"**

Checkbox. Chi co hieu luc thuc su khi Group by = AD_FORMAT. Khi AD_UNIT:
checkbox bi disable va luon duoc check.

  -------------------------------------------------------------------------------
  **Trang thai**        **Enabled?**   **Gia tri** **Ai kiem soat**
  --------------------- -------------- ----------- ------------------------------
  Group by = AD_FORMAT, Enabled        OFF         User
  chua chon                            (default)   

  Group by = AD_FORMAT, Enabled        ON          User
  da chon                                          

  Group by = AD_UNIT    DISABLED       ON (forced) System --- khoa, user khong
                                                   sua duoc
  -------------------------------------------------------------------------------

> RULE RULE UI-G2: Tooltip hien khi hover len checkbox disabled: \"Ad
> unit da co floor tier trong ten --- eCPM floor luon duoc phan biet khi
> group theo ad unit.\"

**2C. Control: \"Country\"**

Radio button, 2 gia tri. Khi chon GROUPS, mo ra form nhap country groups
ben duoi.

  ------------------------------------------------------------------------
  **User chon**   **Form country groups**     **Nut \"Preview\"**
  --------------- --------------------------- ----------------------------
  ALL (default)   AN --- khong hien           Enabled ngay khi cac control
                                              khac hop le

  GROUPS          HIEN --- bat buoc nhap \>=  DISABLED cho den khi co \>=
                  1 group                     1 country group hop le
  ------------------------------------------------------------------------

> RULE RULE UI-G3: Country = GROUPS nhung chua nhap group nao → nut
> Preview/Confirm bi disable. Message ben canh: \"Nhap it nhat 1 country
> group de tiep tuc.\"

**Country group form --- moi group co 3 truong:**

  -------------------------------------------------------------------------
  **Truong**   **Type**        **Bat     **Validation**
                               buoc?**   
  ------------ --------------- --------- ----------------------------------
  group_name   Text input      Co        Khong trong, khong trung voi group
               (short code)              khac, khuyen dung ngan:
                                         \"USCA\",\"SEA\",\"ROW\"

  mode         Radio: INCLUDE  Co        Phai chon 1 trong 2
               \| EXCLUDE                

  countries    Tag input       Co (\>=1) Moi tag: dung 2 chu in hoa ISO
               (multi)                   3166-1 alpha-2. Vi du
                                         \"US\",\"VN\",\"GB\".
  -------------------------------------------------------------------------

> RULE RULE UI-G4: Country code phai la ISO 3166-1 alpha-2 (2 chu in
> hoa). Input lowercase tu dong uppercase. Nhap sai format → hien loi do
> tren tag do: \"XX khong hop le\".
>
> RULE RULE UI-G5: Neu 2+ INCLUDE group cung chua chung 1 country code →
> hien warning vang: \"\[US\] xuat hien o nhieu nhom INCLUDE --- co the
> tao xung dot targeting.\" User van co the tiep tuc nhung phai nhin
> thay warning.

**3. UI Mockup --- 4 trạng thái chính**

4 trang thai duoc mo ta bang ASCII mockup de ro logic hien/an/disable
cua tung control.

**State 1 --- Default (Group by AD_FORMAT, eCPM OFF, Country ALL)**

Trang thai mac dinh khi user vao man hinh chon kich ban. Cho phep sang
buoc Preview ngay.

*State 1: default → resolve S2*

> ┌─────────────────────────────────────────────────────────────┐
>
> │ GROUP BY │
>
> │ (●) Ad Format ( ) Ad Unit │
>
> │ │
>
> │ ECPM FLOOR SPLIT │
>
> │ \[ \] Phan biet High / Medium / All price │
>
> │ (enabled, user chinh duoc) │
>
> │ │
>
> │ COUNTRY │
>
> │ (●) All country ( ) Country groups │
>
> │ │
>
> │ \[ Preview \] ← enabled │
>
> └─────────────────────────────────────────────────────────────┘

**State 2 --- Group by AD_UNIT (eCPM Floor forced ON)**

User doi sang Ad Unit. Checkbox eCPM Floor bi disable va hien checked.
Tooltip giai thich.

*State 2: AD_UNIT + ALL → resolve S1*

> ┌─────────────────────────────────────────────────────────────┐
>
> │ GROUP BY │
>
> │ ( ) Ad Format (●) Ad Unit │
>
> │ │
>
> │ ECPM FLOOR SPLIT │
>
> │ \[✓\] Phan biet High / Medium / All price 🔒 │
>
> │ (disabled --- auto bat khi group theo ad unit) │
>
> │ Tooltip: \"Ad unit da co floor trong ten. │
>
> │ Phan biet floor la bat buoc.\" │
>
> │ │
>
> │ COUNTRY │
>
> │ (●) All country ( ) Country groups │
>
> │ │
>
> │ \[ Preview \] ← enabled │
>
> └─────────────────────────────────────────────────────────────┘

**State 3 --- Country GROUPS, chua nhap (Preview disabled)**

User doi sang Country groups nhung chua nhap. Preview bi disable. Form
nhap group hien ra.

*State 3: AD_FORMAT + ON + GROUPS (chua nhap) → Preview disabled*

> ┌─────────────────────────────────────────────────────────────┐
>
> │ GROUP BY │
>
> │ (●) Ad Format ( ) Ad Unit │
>
> │ │
>
> │ ECPM FLOOR SPLIT │
>
> │ \[✓\] Phan biet High / Medium / All price │
>
> │ │
>
> │ COUNTRY │
>
> │ ( ) All country (●) Country groups │
>
> │ │
>
> │ ┌─ Country Groups ────────────────────────────────────┐ │
>
> │ │ \[+ Them nhom\] │ │
>
> │ │ │ │
>
> │ │ ⚠ Chua co nhom nao. Nhap it nhat 1 nhom. │ │
>
> │ └──────────────────────────────────────────────────────┘ │
>
> │ │
>
> │ \[ Preview \] ← DISABLED (chua co group) │
>
> └─────────────────────────────────────────────────────────────┘

**State 4 --- Country GROUPS, da nhap xong (Preview enabled)**

Da nhap 2 country groups hop le. Preview duoc mo, hien so groups se tao.

*State 4: AD_FORMAT + ON + GROUPS (hop le) → resolve S6*

> ┌─────────────────────────────────────────────────────────────┐
>
> │ GROUP BY │
>
> │ (●) Ad Format ( ) Ad Unit │
>
> │ │
>
> │ ECPM FLOOR SPLIT │
>
> │ \[✓\] Phan biet High / Medium / All price │
>
> │ │
>
> │ COUNTRY │
>
> │ ( ) All country (●) Country groups │
>
> │ │
>
> │ ┌─ Country Groups ────────────────────────────────────┐ │
>
> │ │ \[+ Them nhom\] │ │
>
> │ │ │ │
>
> │ │ ╔══════════════════════════════════════════════╗ │ │
>
> │ │ ║ Ten: \[USCA \] Mode: (●)Include ( )Excl║ │ │
>
> │ │ ║ Quoc gia: \[US\] \[CA\] \[+\] ║ │ │
>
> │ │ ╚══════════════════════════════════════════════╝ │ │
>
> │ │ ╔══════════════════════════════════════════════╗ │ │
>
> │ │ ║ Ten: \[ROW \] Mode: ( )Include (●)Excl║ │ │
>
> │ │ ║ Quoc gia: \[US\] \[CA\] \[+\] ║ │ │
>
> │ │ ╚══════════════════════════════════════════════╝ │ │
>
> │ └──────────────────────────────────────────────────────┘ │
>
> │ │
>
> │ \[ Preview --- se tao \~12 groups \] ← enabled │
>
> └─────────────────────────────────────────────────────────────┘

**4. resolveScenario() --- Logic map UI → Backend**

Ham nay nhan 3 gia tri tu UI, tra ve scenarioId. Chay ca o frontend
(tinh preview label) va backend (validate + route xu ly).

> **type ScenarioId = \"S1\" \| \"S2\" \| \"S3\" \| \"S4\" \| \"S5\" \|
> \"S6\";**
>
> **interface UIState {**
>
> **groupBy: \"AD_FORMAT\" \| \"AD_UNIT\";**
>
> **ecpmFloor: boolean;**
>
> **countryMode: \"ALL\" \| \"GROUPS\";**
>
> **}**
>
> **function resolveScenario(ui: UIState): ScenarioId {**
>
> **// Constraint: AD_UNIT buoc phai ecpmFloor=true**
>
> **// (UI da enforce, backend validate lai cho chac)**
>
> **if (ui.groupBy === \"AD_UNIT\" && !ui.ecpmFloor)**
>
> **throw new Error(\"INVALID: AD_UNIT requires ecpmFloor=true\");**
>
> **if (ui.groupBy === \"AD_UNIT\") {**
>
> **return ui.countryMode === \"ALL\" ? \"S1\" : \"S4\";**
>
> **}**
>
> **// AD_FORMAT**
>
> **if (ui.countryMode === \"ALL\") {**
>
> **return ui.ecpmFloor ? \"S3\" : \"S2\";**
>
> **} else {**
>
> **return ui.ecpmFloor ? \"S6\" : \"S5\";**
>
> **}**
>
> **}**
>
> INFO Function nay duoc goi 2 noi: (1) Frontend khi user thay doi bat
> ky control nao → hien label \"Se tao X groups (S3: Ad format + eCPM
> floor, global)\". (2) Backend khi nhan request → validate + route.

**5. Preview Label --- mô tả scenario cho user**

Khi user chinh controls, ben duoi nut Preview hien dong mo ta kich ban
hien tai. Muc dich: user biet chinh xac se tao kieu group nao.

  -------------------------------------------------------------------------------
  **Scenario**   **Label hien duoi nut Preview**
  -------------- ----------------------------------------------------------------
  S1             Kich ban S1: Moi ad unit → 1 group rieng. Toan cau.

  S2             Kich ban S2: Gom theo ad format, khong phan biet floor. Toan
                 cau.

  S3             Kich ban S3: Gom theo ad format + eCPM floor tier. Toan cau.

  S4             Kich ban S4: Moi ad unit × moi country group → 1 group.

  S5             Kich ban S5: Gom theo ad format, khong phan biet floor. Theo
                 country groups.

  S6             Kich ban S6: Gom theo ad format + eCPM floor tier. Theo country
                 groups.
  -------------------------------------------------------------------------------

So groups du kien hien ngay tren nut: \"Preview --- se tao khoang 12
groups\". Con so nay duoc tinh o frontend dua vao ad units da parse (xem
cong thuc o tai lieu Group Generation Rules).

**6. Validation trước khi gửi request**

Frontend validate hoan toan truoc khi goi /api/mapping/preview. Backend
validate lai lan nua de chac.

  ------------------------------------------------------------------------
  **Dieu kien**             **Loi hien cho user**   **Block action?**
  ------------------------- ----------------------- ----------------------
  Group by = AD_UNIT va     Loi he thong --- lien   Co --- reject ngay
  ecpmFloor = false (khong  he admin                
  the xay ra tu UI)                                 

  Country = GROUPS va khong Nhap it nhat 1 country  Co --- disable Preview
  co country group nao      group                   

  Country group: group_name Ten nhom khong duoc de  Co --- inline error
  trong                     trong                   

  Country group: group_name Ten nhom bi trung:      Co --- inline error
  trung nhau                \"\[X\]\"               

  Country group: khong co   Nhom \"\[X\]\" chua co  Co --- inline error
  quoc gia nao              quoc gia nao            

  Country code sai format   Ma quoc gia \"\[XX\]\"  Co --- red tag, block
  (khong phai ISO alpha-2)  khong hop le            

  2+ INCLUDE group trung    Warning: \"\[US\]\" co  Khong block --- chi
  country code              o nhieu nhom INCLUDE    warn vang, user tu
                                                    quyet
  ------------------------------------------------------------------------

**7. Verify Checklist**

**7A. Controls render dung**

-   \[ \] Default: Group by = AD_FORMAT, eCPM Floor = OFF unchecked
    enabled, Country = ALL, Preview enabled

-   \[ \] Doi sang AD_UNIT: checkbox eCPM Floor hien disabled +
    checked + co lock icon

-   \[ \] Tooltip hien khi hover len checkbox disabled cua eCPM Floor

-   \[ \] Doi Country sang GROUPS: form country group hien ra, Preview
    bi disable ngay

-   \[ \] Doi Country tro ve ALL: form country group an, Preview enabled

-   \[ \] Them 1 country group hop le: Preview duoc mo

-   \[ \] Xoa het country groups khi dang GROUPS: Preview disabled tro
    lai

**7B. resolveScenario() cho dung**

  ------------------------------------------------------------------------
  **Input UI**            **Expected scenario** **Test pass?**
  ----------------------- --------------------- --------------------------
  AD_FORMAT + OFF + ALL   S2                    

  AD_FORMAT + ON + ALL    S3                    

  AD_UNIT + ON + ALL      S1                    

  AD_FORMAT + OFF +       S5                    
  GROUPS                                        

  AD_FORMAT + ON + GROUPS S6                    

  AD_UNIT + ON + GROUPS   S4                    

  AD_UNIT + OFF + ALL     Throw INVALID error   
  ------------------------------------------------------------------------

**7C. Preview label dung**

-   \[ \] Label thay doi ngay khi user doi bat ky control nao (khong can
    submit)

-   \[ \] So groups du kien tren nut Preview khop voi cong thuc trong
    Group Generation Rules

-   \[ \] Label dung scenario ID va mo ta chinh xac

**7D. Country group validation**

-   \[ \] Tag input tu dong uppercase khi nhap lowercase

-   \[ \] Tag \"usa\" (3 chu) hien loi do: \"usa khong hop le\"

-   \[ \] Tag \"US\" (dung): xanh, chap nhan

-   \[ \] 2 INCLUDE groups trung \"US\": hien warning vang (khong block)

-   \[ \] 2 EXCLUDE groups trung \"US\": khong hien warning gi

-   \[ \] Xoa het tag trong 1 group: hien loi \"Nhom X chua co quoc gia
    nao\"

-   \[ \] Trung group_name: hien loi inline, disable Preview

**7E. Backend validation**

-   \[ \] POST /api/mapping/preview voi AD_UNIT + ecpmFloor=false → 400
    INVALID

-   \[ \] POST voi country=GROUPS nhung country_groups=\[\] → 400
    MISSING_GROUPS

-   \[ \] POST voi country code \"USA\" (3 chu) → 400
    INVALID_COUNTRY_CODE

**Quick Reference**

  ------------------------------------------------------------------------
  **Rule**   **Mo ta**                                **Section**
  ---------- ---------------------------------------- --------------------
  UI-G1      AD_UNIT → eCPM Floor force ON, disable   2A
             checkbox                                 

  UI-G2      Tooltip giai thich khi eCPM Floor bi     2B
             disable                                  

  UI-G3      Country = GROUPS + 0 group → Preview     2C
             disabled                                 

  UI-G4      Country code validate ISO alpha-2, auto  2C
             uppercase                                

  UI-G5      2 INCLUDE group trung country → warn     2C
             vang, khong block                        
  ------------------------------------------------------------------------

*--- UI Scenario Selection Spec ---*
