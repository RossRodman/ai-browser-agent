export interface DemoRecord {
  id: number;
  name: string;
  email: string;
  phone: string;
  status: string;
  createdAt: string;
  amount: number;
}

const rows: Omit<DemoRecord, 'id'>[] = [
  {
    name: 'Petro Ivanenko',
    email: 'petro.i@example.com',
    phone: '+380679990011',
    status: 'inactive',
    createdAt: '2025-08-01',
    amount: 1999,
  },
  {
    name: 'Larysa Honchar',
    email: 'LARYSA.H@EXAMPLE.COM ',
    phone: '+380508889900',
    status: 'active',
    createdAt: '2025-07-22',
    amount: 505,
  },
  {
    name: '  ',
    email: 'unknown@example.com',
    phone: '+380937778899',
    status: 'pending',
    createdAt: '2025-06-30',
    amount: 0,
  },
  {
    name: 'Olena Kovalenko',
    email: 'olena.k@example.com',
    phone: '+380501234567',
    status: 'active',
    createdAt: '2025-03-12',
    amount: 1200,
  },
  {
    name: 'Taras Shevchuk',
    email: 'taras.s@example.com',
    phone: '+380672345678',
    status: 'active',
    createdAt: '2025-04-02',
    amount: 540,
  },
  {
    name: 'Iryna Bondar',
    email: 'iryna.b@example.com',
    phone: '+380933456789',
    status: 'inactive',
    createdAt: '2024-11-20',
    amount: 0,
  },
  {
    name: 'Andrii Melnyk',
    email: 'andrii.m@example.com',
    phone: '+380504567890',
    status: 'pending',
    createdAt: '2025-06-18',
    amount: 310,
  },
  {
    name: 'Sofiia Tkachenko',
    email: 'sofiia.t@example.com',
    phone: '+380675678901',
    status: 'active',
    createdAt: '2025-01-09',
    amount: 2750,
  },
  {
    name: 'Maksym Lysenko',
    email: 'maksym.l@example.com',
    phone: '+380936789012',
    status: 'active',
    createdAt: '2025-02-27',
    amount: 89,
  },
  {
    name: 'Kateryna Moroz',
    email: 'kateryna.m@example.com',
    phone: '+380507890123',
    status: 'inactive',
    createdAt: '2024-09-14',
    amount: 0,
  },
  {
    name: 'Dmytro Savchenko',
    email: 'dmytro.s@example.com',
    phone: '+380678901234',
    status: 'active',
    createdAt: '2025-05-21',
    amount: 640,
  },
  {
    name: 'Yuliia Rudenko',
    email: 'yuliia.r@example.com',
    phone: '+380939012345',
    status: 'pending',
    createdAt: '2025-07-03',
    amount: 150,
  },
  {
    name: 'Bohdan Kravets',
    email: 'bohdan.k@example.com',
    phone: '+380500123456',
    status: 'active',
    createdAt: '2025-08-11',
    amount: 980,
  },
  {
    name: 'Nazar Hrytsenko',
    email: '',
    phone: '+380501112233',
    status: 'active',
    createdAt: '2025-03-01',
    amount: 400,
  },
  {
    name: 'Oksana Pavlenko',
    email: 'oksana.pavlenko@example',
    phone: '+380672223344',
    status: 'active',
    createdAt: '2025-02-15',
    amount: 220,
  },
  {
    name: 'Viktor Marchenko',
    email: 'viktor.m@example.com',
    phone: '12345',
    status: 'active',
    createdAt: '2025-01-20',
    amount: 75,
  },
  {
    name: 'Olena Kovalenko',
    email: 'olena.k@example.com',
    phone: '+380501234567',
    status: 'active',
    createdAt: '2025-03-12',
    amount: 1200,
  },
  {
    name: 'Roman Zinchenko',
    email: 'roman.z@example.com',
    phone: '+380934445566',
    status: 'actve',
    createdAt: '2025-04-10',
    amount: 610,
  },
  {
    name: 'Halyna Ostapenko',
    email: 'halyna.o@example.com',
    phone: '+380505556677',
    status: 'active',
    createdAt: '2031-01-01',
    amount: 330,
  },
  {
    name: 'Serhii Polishchuk',
    email: 'serhii.p@example.com',
    phone: '+380676667788',
    status: 'active',
    createdAt: '2025-05-05',
    amount: -150,
  },
];

export function seed(): DemoRecord[] {
  return rows.map((r, i) => ({ id: i + 1, ...r }));
}
