// DEMONSTRATION career tracks and skills used by the rule-based roadmap generator and the seed.
// These are NOT an official qualification framework. Official NSQF/NCVET data must be imported
// separately into a SkillTaxonomy row with isOfficial=true (see docs/ARCHITECTURE.md).
//
// skill tuple: [name, requiredLevel(1-5)]

export const DISCIPLINES = {
  cse: 'Computer Science & Engineering',
  it: 'Information Technology',
  ece: 'Electronics & Communication',
  electrical: 'Electrical Engineering',
  mechanical: 'Mechanical Engineering',
  civil: 'Civil Engineering',
  biotech: 'Biotechnology',
  management: 'Management',
};

export const TRACKS = {
  cse: [
    { role: 'Backend Software Engineer', skills: [['Data Structures & Algorithms', 4], ['Python Programming', 3], ['SQL & Relational Databases', 3], ['REST API Design', 3], ['Git & Version Control', 3], ['Operating Systems', 2]] },
    { role: 'Machine Learning Engineer', skills: [['Python Programming', 4], ['Statistics & Probability', 3], ['Machine Learning Fundamentals', 4], ['Data Structures & Algorithms', 3], ['SQL & Relational Databases', 2], ['Git & Version Control', 2]] },
  ],
  it: [
    { role: 'Full-Stack Web Developer', skills: [['JavaScript Programming', 4], ['HTML & CSS', 3], ['React Basics', 3], ['REST API Design', 3], ['SQL & Relational Databases', 3], ['Git & Version Control', 3]] },
    { role: 'Cloud & DevOps Associate', skills: [['Linux Administration', 3], ['Networking Fundamentals', 3], ['Cloud Fundamentals', 3], ['Git & Version Control', 3], ['CI/CD Basics', 3], ['Python Programming', 2]] },
  ],
  ece: [
    { role: 'Embedded Systems Engineer', skills: [['Embedded C Programming', 4], ['Microcontroller Basics', 4], ['Digital Electronics', 3], ['Circuit Analysis', 3], ['Communication Protocols', 3]] },
    { role: 'VLSI / Hardware Design Trainee', skills: [['Digital Electronics', 4], ['Verilog HDL', 3], ['Circuit Analysis', 3], ['Semiconductor Devices', 3]] },
  ],
  electrical: [
    { role: 'Power Systems Engineer', skills: [['Power Systems Analysis', 4], ['Electrical Machines', 3], ['Circuit Analysis', 3], ['Protection & Switchgear', 3], ['MATLAB / Simulink', 2]] },
    { role: 'Control & Automation Engineer', skills: [['Control Systems', 4], ['PLC Programming', 3], ['Electrical Machines', 3], ['MATLAB / Simulink', 3], ['Circuit Analysis', 2]] },
  ],
  mechanical: [
    { role: 'Design Engineer (CAD)', skills: [['CAD Modelling', 4], ['Engineering Mechanics', 3], ['Manufacturing Processes', 3], ['GD&T Basics', 3], ['Material Science', 2]] },
    { role: 'Thermal / CAE Analyst', skills: [['Thermodynamics', 4], ['Heat Transfer', 3], ['Finite Element Analysis', 3], ['CAD Modelling', 3], ['Fluid Mechanics', 3]] },
  ],
  civil: [
    { role: 'Structural / Site Engineer', skills: [['Structural Analysis', 4], ['Surveying', 3], ['Construction Materials', 3], ['AutoCAD Drafting', 3], ['Estimation & Costing', 3]] },
    { role: 'Geotechnical / Transportation Analyst', skills: [['Geotechnical Engineering', 4], ['Transportation Engineering', 3], ['Surveying', 3], ['AutoCAD Drafting', 2], ['Estimation & Costing', 2]] },
  ],
  biotech: [
    { role: 'Bioprocess / Lab Associate', skills: [['Molecular Biology Techniques', 4], ['Microbiology', 3], ['Bioprocess Engineering', 3], ['Laboratory Safety & GLP', 3], ['Biostatistics', 2]] },
    { role: 'Bioinformatics Analyst', skills: [['Bioinformatics Tools', 3], ['Python Programming', 3], ['Biostatistics', 3], ['Molecular Biology Techniques', 3], ['SQL & Relational Databases', 2]] },
  ],
  management: [
    { role: 'Business Analyst', skills: [['Business Communication', 4], ['Excel & Data Analysis', 4], ['Financial Accounting Basics', 3], ['Marketing Fundamentals', 2], ['SQL & Relational Databases', 2]] },
    { role: 'Operations / Marketing Associate', skills: [['Marketing Fundamentals', 4], ['Business Communication', 3], ['Operations Management', 3], ['Excel & Data Analysis', 3], ['Financial Accounting Basics', 2]] },
  ],
};

// Skill → category (used for demo taxonomy rows)
const CATEGORY_HINTS = [
  [/Python|JavaScript|C Programming|React|Verilog|HTML|SQL|MATLAB|PLC/i, 'Technical'],
  [/Communication|Marketing|Operations|Accounting/i, 'Professional'],
];
export const categoryFor = (name) => (CATEGORY_HINTS.find(([re]) => re.test(name)) || [null, 'Domain'])[1];

export function allSkillNames() {
  const set = new Set();
  for (const roles of Object.values(TRACKS)) for (const r of roles) for (const [n] of r.skills) set.add(n);
  return [...set].sort();
}
export function disciplinesForSkill(name) {
  const out = [];
  for (const [d, roles] of Object.entries(TRACKS)) if (roles.some((r) => r.skills.some(([n]) => n === name))) out.push(d);
  return out;
}
export function findTrack(discipline, role) {
  const roles = TRACKS[discipline] || [];
  return roles.find((r) => r.role.toLowerCase() === String(role || '').toLowerCase()) || null;
}
export function findTrackAnywhere(role) {
  for (const [d, roles] of Object.entries(TRACKS)) {
    const t = roles.find((r) => r.role.toLowerCase() === String(role || '').toLowerCase());
    if (t) return { discipline: d, ...t };
  }
  return null;
}
