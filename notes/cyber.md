# Cyber Security: Impact on Govts, Policies and Economics

> Minor Elective · 2 credits · Semester VII. Exam-oriented notes built from the official syllabus (4 units). Cross-check with your class notes; faculty may add their own case studies.

**Course outcomes in one line each:** see cybersecurity at the world stage (CO1) · argue for policy frameworks (CO2) · understand global cyber challenges (CO3) · understand cyber control systems (CO4).

---

## Unit 1 · The UN, International Law and Cyberspace

### 1.1 History and role of the United Nations
Cyberspace has no borders, but laws do. The UN is the main forum where countries try to agree on **"rules of the road"** for state behaviour online.

**Timeline to remember**
| Year | Milestone |
|---|---|
| 1998 | Russia tables the first UN General Assembly resolution on information security |
| 2003–05 | World Summit on the Information Society (WSIS), run with the **ITU** |
| 2004 | First **UN Group of Governmental Experts (GGE)** on ICTs and international security |
| 2013 | GGE report: **international law, including the UN Charter, applies to cyberspace** |
| 2015 | GGE report: **11 voluntary, non-binding norms** of responsible state behaviour (endorsed by the UNGA) |
| 2019–21 | **Open-Ended Working Group (OEWG)** — open to all UN members, reaffirms the framework |
| 2024 | UNGA adopts the **UN Convention against Cybercrime** (first global cybercrime treaty) |

**Key 2015 norms (write 4–5 in the exam)**
- States should not knowingly allow their territory to be used for cyber attacks on others.
- States should not damage another country's **critical infrastructure** in peacetime.
- States should not attack **CERTs / CSIRTs** (incident-response teams).
- States should cooperate to share information and prosecute criminals.
- States should report ICT vulnerabilities and protect the **supply chain**.
- Respect human rights online, including privacy and freedom of expression.

**UN bodies involved:** ITU (telecom standards, Global Cybersecurity Index), UNODC (cybercrime), UNIDIR (research), UN Security Council (when attacks threaten peace).

**Limitations:** norms are voluntary; no enforcement body; big powers disagree (Western states favour an open internet and existing law; Russia/China push "**cyber sovereignty**" and state control of information); **attribution** of attacks is hard.

### 1.2 Applying international law to cyberspace
| Principle | What it means online |
|---|---|
| **Sovereignty** | A state controls the cyber infrastructure on its territory; remote operations that cause effects there may violate it |
| **Non-intervention** | No coercive interference in another state's internal affairs (e.g. hacking elections) |
| **Prohibition of force** — UN Charter **Art. 2(4)** | A cyber operation causing death or physical destruction similar to a kinetic attack can be a "use of force" |
| **Self-defence** — **Art. 51** | A victim of an "armed attack" (incl. a cyber one of that scale) may respond, with **necessity** and **proportionality** |
| **State responsibility** | States are responsible for operations by their organs or proxies they control |
| **Due diligence** | States should stop known malicious activity launched from their territory |
| **International Humanitarian Law** | In war: distinction (civilian vs military targets), proportionality, precaution |

**Other instruments**
- **Budapest Convention on Cybercrime (2001, Council of Europe)** — first treaty on cybercrime; harmonises offences and cross-border cooperation. India is **not** a party.
- **Tallinn Manual (2013) / Tallinn Manual 2.0 (2017)** — expert (non-binding) study of how existing international law applies to cyber operations, produced at NATO CCDCOE.

### 1.3 Case studies: states exploiting cyberspace
| Case | Year | What happened | Lesson |
|---|---|---|---|
| **Estonia** | 2007 | Weeks of DDoS on government, banks and media after a Soviet war memorial was relocated; linked to Russian actors | First "cyber attack on a nation"; led to NATO CCDCOE in Tallinn |
| **Stuxnet** (Iran) | discovered 2010 | Worm that sabotaged centrifuges at Natanz by manipulating Siemens PLCs; widely attributed to the US and Israel | First known cyber weapon causing **physical damage** |
| **Ukraine power grid** | 2015 | BlackEnergy malware cut power to roughly 230,000 people | Critical infrastructure is a real target |
| **WannaCry** | 2017 | Ransomware worm hit 150+ countries incl. UK's NHS; attributed to North Korea | Leaked state tools + unpatched systems = global damage |
| **NotPetya** | 2017 | "Ransomware" that actually wiped data; started in Ukraine, hit Maersk, Merck etc.; attributed to Russia's GRU | Collateral damage to the global economy (~billions USD) |
| **US election interference** | 2016 | Hack-and-leak + social media influence operations | Cyber + information warfare against democracy |
| **SolarWinds** | 2020 | Supply-chain compromise of Orion software reached US agencies | Espionage via trusted software updates |
| **India: AIIMS Delhi** | 2022 | Ransomware disrupted hospital servers for days | Public services and health data at risk |

**Likely questions:** role of the UN in cyber norms · does international law apply to cyberspace? · explain Stuxnet/NotPetya as case studies · why is attribution difficult?

---

## Unit 2 · Global Data Centres and Cloud Computing

### 2.1 Why data centres matter
Everything we do online — UPI payments, Instagram, ChatGPT, DigiLocker — runs in **data centres**. Their number and size are growing fast (AI is accelerating this), so they are now **critical infrastructure**.

**Security issues**
1. **Physical security** — fire, power failure, natural disasters, unauthorised entry.
2. **Insider threats** — admins with high privileges.
3. **DDoS attacks** on hosted services.
4. **Misconfiguration** — open storage buckets, exposed databases (the most common cloud breach cause).
5. **Supply-chain risk** — compromised hardware/firmware or software updates.
6. **Multi-tenancy** — many customers share the same hardware; isolation failures leak data.
7. **Concentration risk** — a few providers (AWS, Azure, Google) host a huge share of the internet; one outage affects millions.
8. **Energy & sustainability** — huge power and water use; power is a security dependency.

### 2.2 Data sovereignty and localisation
- **Data sovereignty:** data is subject to the laws of the country where it is stored.
- **Data localisation:** laws requiring certain data to be stored inside the country. Example: **RBI (2018)** requires payment-system data to be stored in India.
- **India's Digital Personal Data Protection (DPDP) Act, 2023** — consent-based processing, rights of data principals, Data Protection Board; government can restrict transfer to notified countries.
- **EU GDPR (2018)** — strict rules on transfers outside the EU.
- **Arguments for localisation:** law-enforcement access, national security, local jobs. **Against:** higher costs, fragmentation ("splinternet"), not automatically more secure.

### 2.3 Cloud computing
**NIST definition:** on-demand network access to a shared pool of configurable computing resources that can be rapidly provisioned and released with minimal management effort.

**5 essential characteristics:** on-demand self-service · broad network access · resource pooling · rapid elasticity · measured service (pay-as-you-go).

| Service model | You manage | Provider manages | Example |
|---|---|---|---|
| **IaaS** | OS, apps, data | Hardware, network, virtualisation | AWS EC2 |
| **PaaS** | Apps and data | Runtime, OS, infrastructure | Google App Engine, Heroku |
| **SaaS** | Only your data/usage | Everything else | Gmail, Microsoft 365 |

**Deployment models:** public · private · hybrid · community.

**Shared responsibility model:** the provider secures the cloud (*of* the cloud); the customer secures what they put *in* the cloud (data, access, configuration).

### 2.4 Exponential growth of data and storage
- Global data is measured in **zettabytes** (1 ZB = 10²¹ bytes) and keeps growing rapidly due to smartphones, IoT, video and AI.
- Storage types: **DAS** (direct-attached), **NAS** (file-level over network), **SAN** (block-level, high-speed), **object storage** (S3-style, massively scalable).
- More data = bigger attack surface and higher value for attackers.

**Cloud security controls:** encryption at rest and in transit · strong IAM + MFA · least privilege · logging and monitoring · CASB · **zero-trust** architecture · backups (ransomware recovery).

**Example breach:** **Capital One (2019)** — a misconfigured web application firewall in AWS exposed data of ~100 million customers.

**Likely questions:** security issues of global data centres · define cloud computing with service/deployment models · data localisation pros and cons · shared responsibility model.

---

## Unit 3 · Cyber Control Systems, Warfare and Defence

### 3.1 Cyber control systems
**Industrial Control Systems (ICS)** run physical processes — power grids, water treatment, pipelines, factories.
- **SCADA** (Supervisory Control and Data Acquisition): monitors and controls geographically spread assets.
- **PLC** (Programmable Logic Controller): small computers controlling machines.
- **DCS** (Distributed Control System): process control inside one plant.

**Why vulnerable:** built for reliability, not security; old systems that can't be patched; now connected to IT networks/internet; attacks cause **physical** harm (Stuxnet, Ukraine grid).

### 3.2 Cyber command systems
Military/government organisations that plan, defend and conduct cyber operations.
- **USA:** US Cyber Command (2009).
- **India:** **Defence Cyber Agency** (tri-service, operational 2019); **NCIIPC** protects critical information infrastructure (under NTRO, IT Act s.70A); **CERT-In** is the national incident-response agency; National Cyber Security Coordinator under the NSCS.
- **NATO** recognised cyberspace as an **operational domain** in 2016.

### 3.3 Cyber warfare
**Definition:** use of cyber attacks by a state (or its proxies) against another state to cause damage, disruption or gain strategic advantage.

**Forms:** espionage (stealing secrets) · sabotage of infrastructure · DDoS · propaganda and disinformation · attacks on financial systems · election interference.

**Features:** low cost, high impact (**asymmetric**) · hard **attribution** · no clear battlefield · use of proxies and criminal groups · can happen in peacetime ("grey zone").

### 3.4 Cyber soldiers and battalions
Specialised state units of hackers, analysts and engineers.
| Country | Example units (publicly reported) |
|---|---|
| China | PLA Unit 61398 (APT1), Strategic Support Force (reorganised 2024) |
| Russia | GRU Units 26165 (APT28/Fancy Bear) and 74455 (Sandworm) |
| North Korea | Reconnaissance General Bureau / Lazarus Group (also steals crypto to fund the state) |
| Israel | Unit 8200 |
| USA | Cyber Mission Force under US Cyber Command |

### 3.5 Cyber resilience
**Ability to anticipate, withstand, recover from and adapt to cyber attacks** — assume breaches will happen and keep operating.

**NIST Cybersecurity Framework 2.0 (2024):** **Govern · Identify · Protect · Detect · Respond · Recover.**

Practices: backups and disaster recovery, incident-response plans, redundancy, network segmentation, regular drills, threat intelligence sharing.

### 3.6 Cyberspace as part of defence strategy
- Cyberspace is the **5th domain** of warfare (after land, sea, air, space).
- **Deterrence** — by denial (strong defence) and by punishment (ability to retaliate).
- **Active defence / "defend forward"** — disrupting attackers before they strike.
- Integrated with intelligence, information warfare and conventional operations (e.g. cyber attacks alongside the 2022 Russia–Ukraine war, such as the Viasat satellite network attack).

**Likely questions:** explain SCADA security · define cyber warfare and its features · cyber resilience with NIST CSF · role of cyberspace in national defence; India's cyber institutions.

---

## Unit 4 · State Surveillance, Cyber Freedom and the Economy

### 4.1 State surveillance
- **Targeted surveillance:** monitoring specific suspects with legal authorisation.
- **Mass surveillance:** bulk collection of everyone's data/metadata.

**Examples**
- **PRISM / Snowden revelations (2013)** — US NSA programs collecting data from major tech companies.
- **Pegasus Project (2021)** — spyware from NSO Group reportedly used against journalists, activists and politicians in several countries, including India.
- **India:** interception under **IT Act s.69** and the Telegraph Act; Central Monitoring System (CMS); NATGRID.

**Concerns:** chilling effect on free speech · misuse against critics · weak oversight · data breaches of surveillance databases.

### 4.2 Cyber freedom
Freedom of expression, access to information and privacy online.
- **Threats:** censorship, content blocking (IT Act **s.69A**), **internet shutdowns** (India has recorded some of the highest numbers worldwide), "Great Firewall" model (China).
- **Anuradha Bhasin v. Union of India (2020)** — Supreme Court: freedom of speech and trade via the internet is protected under Art. 19; shutdowns must be necessary, proportionate and reviewed.

### 4.3 Privacy vs security trade-off
| Security side | Privacy side |
|---|---|
| Lawful access helps catch terrorists and criminals | Mass data collection treats every citizen as a suspect |
| Encryption "backdoors" requested for investigations | A backdoor for police is also a backdoor for hackers |
| Data retention aids investigation | Stored data can be breached or misused |

- **Justice K.S. Puttaswamy v. Union of India (2017)** — 9-judge bench: **privacy is a fundamental right** (Art. 21); restrictions must pass **legality, necessity and proportionality**.
- **Apple vs FBI (2016)** — Apple refused to build a tool to unlock a shooter's iPhone; showed the encryption debate.
- **DPDP Act 2023** — gives individuals rights over personal data, but allows government exemptions (a point of criticism).

**Balanced view for answers:** use proportionality, independent oversight, transparency reports and sunset clauses.

### 4.4 Impact on the public, governments and economies
- **Public:** online fraud (UPI/OTP scams), identity theft, sextortion, data leaks.
- **Governments:** attacks on hospitals and services (AIIMS 2022), election security, loss of trust.
- **Economy:** Cybercrime cost is projected in **trillions of USD per year globally**; ransomware halts business (e.g. **Colonial Pipeline, 2021** — US fuel pipeline shut down, ransom paid); rising cyber-insurance costs; investor confidence and digital-economy growth depend on trust.
- **New dimensions:** AI-driven deepfakes and phishing, crypto-funded ransomware, attacks on supply chains, quantum threat to current encryption.

**Likely questions:** state surveillance and cyber freedom · privacy vs security with Indian case law · economic impact of cyber attacks with examples.

---

## Lab (Kali Linux tools) — quick map
| Category | Tools |
|---|---|
| Information gathering | Dnmap, Sparta, Hping3, Netdiscover, Recon-ng |
| Web app analysis | WebScarab, HTTrack, OWASP ZAP |
| Password attacks | John the Ripper, Crunch, Ncrack, wordlists, RainbowCrack |
| Sniffing & spoofing | MACchanger, Responder, Wireshark, Hamster |
| Exploitation / maintaining access | Exe2hex, Weevely, Proxychains |
| Forensics | Foremost, Binwalk, Autopsy |
| Reporting | Pipal, CaseFile, CutyCapt, Faraday IDE, MagicTree |

**References:** Godbole & Belapure, *Cyber Security* (Wiley, 2013); Tripathi, Goyal & Shukla, *Introduction to Information Security and Cyber Laws* (Dreamtech, 2015).
