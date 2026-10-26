#!/usr/bin/env python3
import os
from PIL import Image, ImageDraw, ImageFont

def generate_screenshot():
    width = 900
    height = 650
    
    # Fundo moderno estilo Cinnamon Mint-Y Dark
    img = Image.new("RGBA", (width, height), (35, 38, 41, 255))
    draw = ImageDraw.Draw(img)
    
    # Barra de tarefas do Cinnamon na parte inferior
    panel_height = 44
    panel_y = height - panel_height
    draw.rectangle([0, panel_y, width, height], fill=(24, 26, 27, 255))
    
    # Fontes
    font_bold = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 16)
    font_title = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 18)
    font_med = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14)
    font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 12)
    font_icon = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 20)

    # Painel inferior: Ícones da bandeja
    # Ícone do menu Mint à esquerda
    draw.text((16, panel_y + 12), "LM", fill=(142, 192, 124, 255), font=font_bold)
    draw.text((45, panel_y + 13), "Menu", fill=(220, 220, 220, 255), font=font_med)
    
    # Ícone do applet RadioViva no painel à direita
    applet_x = width - 280
    draw.rectangle([applet_x - 10, panel_y + 4, width - 40, panel_y + panel_height - 4], fill=(45, 52, 54, 255), outline=(70, 75, 78, 255))
    draw.text((applet_x, panel_y + 12), "📻 RadioViva: Jovem Pan FM 89.9", fill=(138, 226, 52, 255), font=font_small)

    # Janela Popup Menu do RadioViva
    menu_w = 420
    menu_h = 540
    menu_x = width - menu_w - 40
    menu_y = panel_y - menu_h - 10

    # Sombra do menu
    for i in range(8):
        draw.rounded_rectangle(
            [menu_x - i, menu_y - i, menu_x + menu_w + i, menu_y + menu_h + i],
            radius=12 + i,
            outline=(0, 0, 0, 15)
        )
    
    # Caixa principal do menu
    draw.rounded_rectangle(
        [menu_x, menu_y, menu_x + menu_w, menu_y + menu_h],
        radius=10,
        fill=(38, 42, 46, 255),
        outline=(65, 70, 75, 255),
        width=1
    )

    # 1. Player Card no topo
    card_margin = 14
    card_x = menu_x + card_margin
    card_y = menu_y + card_margin
    card_w = menu_w - (card_margin * 2)
    card_h = 140

    draw.rounded_rectangle(
        [card_x, card_y, card_x + card_w, card_y + card_h],
        radius=8,
        fill=(28, 31, 34, 255),
        outline=(50, 55, 60, 255)
    )

    # Logo / Ícone dentro do Card
    icon_path = os.path.join(os.path.dirname(__file__), "..", "src", "icon.png")
    if os.path.exists(icon_path):
        icon_img = Image.open(icon_path).convert("RGBA").resize((44, 44))
        img.paste(icon_img, (card_x + 14, card_y + 14), icon_img)

    draw.text((card_x + 68, card_y + 16), "Jovem Pan FM Campinas - 89.9", fill=(255, 255, 255, 255), font=font_bold)
    draw.text((card_x + 68, card_y + 38), "Ao vivo • Campinas, SP", fill=(138, 226, 52, 255), font=font_med)

    # Barra de Botões de Controle
    btn_y = card_y + 75
    btn_w = 48
    btn_h = 36
    spacing = 10
    start_btn_x = card_x + 40

    buttons = [
        ("⏸", (40, 167, 69, 255)), # Play/Pause
        ("⏹", (55, 60, 65, 255)),  # Stop
        ("🔉", (55, 60, 65, 255)), # Vol -
        ("🔊", (55, 60, 65, 255)), # Vol +
        ("🔇", (55, 60, 65, 255))  # Mute
    ]

    for idx, (symbol, color) in enumerate(buttons):
        bx = start_btn_x + (idx * (btn_w + spacing))
        draw.rounded_rectangle([bx, btn_y, bx + btn_w, btn_y + btn_h], radius=6, fill=color)
        draw.text((bx + 16, btn_y + 7), symbol, fill=(255, 255, 255, 255), font=font_bold)

    # 2. Slider de Volume
    slider_y = card_y + card_h + 16
    draw.text((card_x, slider_y), "Volume", fill=(180, 180, 180, 255), font=font_small)
    draw.text((card_x + card_w - 30, slider_y), "80%", fill=(180, 180, 180, 255), font=font_small)
    
    # Barra do slider
    draw.rounded_rectangle([card_x, slider_y + 18, card_x + card_w, slider_y + 24], radius=3, fill=(60, 65, 70, 255))
    draw.rounded_rectangle([card_x, slider_y + 18, card_x + int(card_w * 0.8), slider_y + 24], radius=3, fill=(138, 226, 52, 255))
    draw.ellipse([card_x + int(card_w * 0.8) - 6, slider_y + 15, card_x + int(card_w * 0.8) + 6, slider_y + 27], fill=(255, 255, 255, 255))

    # Linha separadora
    sep_y = slider_y + 40
    draw.line([card_x, sep_y, card_x + card_w, sep_y], fill=(55, 60, 65, 255), width=1)

    # 3. Lista de Minhas Rádios
    stations = [
        ("Jovem Pan FM Campinas - 89.9", True),
        ("Difusora FM 102.3 Piracicaba", False),
        ("98 ROCK BRASIL", False),
        ("89 FM A Rádio Rock", False),
        ("Alpha FM 101.7", False),
        ("Antena 1 FM 94.7", False),
        ("Kiss FM 92.5", False),
        ("CBN São Paulo - 90.5 FM", False)
    ]

    list_y = sep_y + 10
    row_h = 32

    for name, is_active in stations:
        if is_active:
            draw.rounded_rectangle([card_x, list_y, card_x + card_w, list_y + row_h], radius=6, fill=(45, 75, 45, 255))
            draw.text((card_x + 12, list_y + 7), "⏸", fill=(138, 226, 52, 255), font=font_med)
            draw.text((card_x + 40, list_y + 7), name, fill=(255, 255, 255, 255), font=font_bold)
        else:
            draw.text((card_x + 12, list_y + 7), "▶", fill=(160, 160, 160, 255), font=font_med)
            draw.text((card_x + 40, list_y + 7), name, fill=(220, 220, 220, 255), font=font_med)
        list_y += row_h + 3

    # Botão de Configurações no rodapé
    cfg_y = list_y + 10
    draw.line([card_x, cfg_y, card_x + card_w, cfg_y], fill=(55, 60, 65, 255), width=1)
    draw.text((card_x + 12, cfg_y + 10), "⚙️  Configurar Rádios (Buscar no Brasil)...", fill=(180, 210, 180, 255), font=font_med)

    out_path = os.path.join(os.path.dirname(__file__), "..", "screenshot.png")
    img.save(out_path, "PNG")
    print(f"Screenshot gerado com sucesso: {out_path}")

if __name__ == "__main__":
    generate_screenshot()
